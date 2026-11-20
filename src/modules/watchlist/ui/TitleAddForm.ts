import { Notice } from 'obsidian';
import type { DataManager } from '../services/DataManager';
import type { ApiService } from '../../../shared/api/ApiService';
import type { SettingsReader, SettingsWriter } from '../../settings/exports';
import type { AddFormContext, AddFormHandle, AddKind } from '../../add/exports';
import type { HoardGroup, MaybeTitle, Season } from '../domain/model';
import { todayIso } from '../../../shared/domain/date';
import { apiGroupOf, type SourceType } from '../../../shared/domain/sourceType';
import { completedEpisodes } from '../domain/completedEpisodes';
import { newTitle } from '../domain/newTitle';
import { nonEmpty } from '../../../shared/domain/sharedHelpers';
import { t } from '../../../shared/i18n';
import type { LookupResult } from '../../../shared/api/lookup';
import { priorityLabel, statusLabel } from '../../../shared/i18n/labels';
import {
	fillMediaFields,
	resolvePick,
	type MediaFields,
	type TitlePick,
	type TitleSearchApi,
	type TitleSearchResult,
} from '../../../shared/services/titleSearch';
import { createDatePicker } from '../../../design-system/DatePicker';
import { blockDuplicate, createDuplicateGuard } from '../../../design-system/DuplicateGuard';
import {
	makeCell,
	makeRow,
	renderMediaAndTypeFields,
	nameSelect,
	renderGroupPicker,
	renderRatingRow,
	runWhileBusy,
	type GroupPickerState,
} from '../../../design-system/FormCells';

export type AddTitleStore = Pick<
	DataManager,
	| 'getTitles' | 'getGroups' | 'generateId' | 'generateGroupId' | 'addTitle' | 'addTitleToGroup' | 'addGroup'
	| 'recordLookup' | 'updateCommunityRating' | 'generateMaybeId' | 'addMaybeTitle'
>;
export type AddTitleApi = TitleSearchApi & Pick<ApiService, 'fetchCommunityRating'>;

/** The Source Type a watchlist kind is saved as; the provider only claims anime, series and movie. */
export function sourceTypeOfKind(kind: AddKind): SourceType {
	if (kind === 'anime') return 'Anime';
	return kind === 'movie' ? 'Movie' : 'Series';
}

/** The Type label the form preselects per kind; a deleted type falls back to the first one. */
function defaultTypeOfKind(kind: AddKind): string {
	const sourceType = sourceTypeOfKind(kind);
	return sourceType === 'Series' ? 'TV Show' : sourceType;
}

class TitleAddForm implements AddFormHandle {
	private readonly sourceType: SourceType;
	private selectedType: string;
	private readonly media: MediaFields = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };
	private seasons: Season[] = [];
	private status = 'Plan to watch';
	private priority = 'Medium';
	private rating = 0;
	private dateStarted = '';
	private malId: number | null = null;
	private anilistId: number | null = null;
	// trailer resolved at selection (undefined = not fetched yet); a miss or failure is recorded on add
	private trailer: LookupResult<string> | undefined;
	// credits resolved at selection ([] unfetched, or names)
	private director: string[] = [];
	private cast: string[] = [];
	private studio: string[] = [];
	private posterUrl = '';
	private readonly duplicates = createDuplicateGuard();
	private readonly group: GroupPickerState = { selectedGroupId: '', newGroupName: '' };
	private destroyed = false;

	constructor(
		private readonly host: HTMLElement,
		private readonly settings: SettingsReader & SettingsWriter,
		private readonly titles: AddTitleStore,
		private readonly api: AddTitleApi,
		private readonly ctx: AddFormContext,
		private readonly result: TitleSearchResult | null,
	) {
		this.sourceType = sourceTypeOfKind(ctx.kind);
		const names = settings.get().types.map((ty) => ty.name);
		const preferred = defaultTypeOfKind(ctx.kind);
		this.selectedType = names.length === 0 || names.includes(preferred) ? preferred : names[0]!;
	}

	start(): void {
		if (!this.result) {
			// a hit whose search row is gone arrives here too: seed what the hit still carries
			this.media.title = this.ctx.hit?.title ?? this.ctx.query;
			this.posterUrl = this.ctx.hit?.thumbUrl ?? '';
			this.render();
			return;
		}
		this.host.createDiv({ cls: 'hoard-modal__loading', text: t('common.loading') });
		void resolvePick(this.settings, this.api, this.result, () => !this.destroyed, (pick) => this.applyPick(pick))
			.then((current) => { if (current && !this.destroyed) this.render(); });
	}

	destroy(): void {
		this.destroyed = true;
		this.host.empty();
	}

	private applyPick(pick: TitlePick): void {
		fillMediaFields(this.media, pick);
		this.seasons = pick.seasons;
		this.trailer = pick.trailer;
		this.director = pick.director;
		this.cast = pick.cast;
		this.studio = pick.studio;
		this.posterUrl = pick.posterUrl ?? '';
		if (pick.animeIds) {
			this.malId = pick.animeIds.malId;
			this.anilistId = pick.animeIds.anilistId;
		}
	}

	private typeNames(): string[] {
		return this.settings.get().types.map((ty) => ty.name);
	}

	private render(): void {
		this.host.empty();
		const form = this.host.createDiv({ cls: 'hoard-modal__form' });
		const maybe = this.ctx.target === 'maybe';
		renderMediaAndTypeFields(form, this.media, !maybe, {
			names: this.typeNames(),
			selected: this.selectedType,
			onChange: (v) => { this.selectedType = v; },
		});
		if (!maybe) this.renderLibraryFields(form);
		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const submit = btnRow.createEl('button', {
			cls: 'hoard-btn hoard-btn--primary',
			text: maybe ? t('misc.maybeAdd.submit') : t('add.title.submit'),
		});
		submit.addEventListener('click', () => void runWhileBusy(submit, () => (maybe ? this.addMaybe() : this.addTitle())));
	}

	private renderLibraryFields(form: HTMLElement): void {
		// status + priority paired 50/50 (status excludes "To be released": it follows releaseDate)
		const statusPriRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const statuses = this.settings.get().statuses.filter((s) => s.name !== 'To be released');
		nameSelect(makeCell(statusPriRow, t('add.status')), statuses.map((s) => s.name), this.status,
			(v) => { this.status = v; }, false, statusLabel);
		nameSelect(makeCell(statusPriRow, t('add.priority'), true), this.settings.get().priorities.map((p) => p.name),
			this.priority, (v) => { this.priority = v; }, false, priorityLabel);

		renderRatingRow(
			form,
			this.rating,
			{ allowHalf: this.settings.get().halfStarRatings ?? false, tiers: this.settings.get().ratingSystem },
			(value) => { this.rating = value; },
		);

		createDatePicker({
			parent: makeRow(form, t('add.dateStarted')),
			inputCls: 'hoard-modal__input',
			value: this.dateStarted || null,
			onChange: (iso) => { this.dateStarted = iso ?? ''; },
		});

		renderGroupPicker(form, this.titles.getGroups(), this.group);

		if (this.seasons.length > 0) {
			makeRow(form, t('add.seasons')).createSpan({
				cls: 'hoard-modal__info',
				text: this.seasons.map((s) => t('add.title.seasonEpisodes', { name: s.name, count: s.episodes })).join(', '),
			});
		}
	}

	private async addMaybe(): Promise<void> {
		const name = this.media.title.trim();
		if (!name) { new Notice(t('misc.maybeAdd.titleRequired')); return; }
		const entry: MaybeTitle = {
			id: this.titles.generateMaybeId(name),
			title: name,
			type: this.selectedType,
			sourceType: this.sourceType,
			releaseDate: this.media.releaseDate || null,
			externalLink: this.media.link,
			totalEpisodes: this.media.episodes,
			episodeDuration: this.media.duration,
			dateAdded: new Date().toISOString(),
		};
		await this.titles.addMaybeTitle(entry);
		new Notice(t('misc.maybeAdd.added', { title: name }));
		this.ctx.done({ kind: this.ctx.kind, id: entry.id });
	}

	private async addTitle(): Promise<void> {
		const name = this.media.title.trim();
		if (!name) {
			new Notice(t('add.title.emptyName'));
			return;
		}
		const isDuplicate = this.titles.getTitles().some((existing) => existing.title.toLowerCase() === name.toLowerCase());
		const blocked = blockDuplicate(this.host, this.duplicates, {
			name,
			isDuplicate,
			verb: 'Add',
			retry: () => void this.addTitle(),
		});
		if (blocked) return;

		// added as Completed: every episode is ticked, and the finish date set when the setting asks for it
		const allEpisodes = completedEpisodes(this.status, this.media.episodes);
		const entry = newTitle({
			id: this.titles.generateId(name),
			title: name,
			type: this.selectedType,
			sourceType: this.sourceType,
			status: this.status,
			priority: this.priority,
			rating: this.rating,
			dateStarted: this.dateStarted || null,
			dateFinished: allEpisodes && this.settings.get().setFinishDateAutomatically ? todayIso() : null,
			totalEpisodes: this.media.episodes,
			episodeDuration: this.media.duration,
			releaseDate: this.media.releaseDate || null,
			externalLink: this.media.link,
			seasons: this.seasons,
			watchedEpisodes: allEpisodes,
			favorite: false,
			posterUrl: this.posterUrl,
			trailerUrl: this.trailer?.status === 'found' ? this.trailer.value : '',
			manualTrailerUrl: '',
			// empty stays absent (= unfetched) so the detail modal's lazy backfill runs
			director: nonEmpty(this.director),
			cast: nonEmpty(this.cast),
			studio: nonEmpty(this.studio),
			malId: this.malId ?? undefined,
			anilistId: this.anilistId ?? undefined,
		});

		await this.titles.addTitle(entry);
		if (this.trailer) this.titles.recordLookup(entry.id, 'trailer', this.trailer);

		// fire-and-forget community rating fetch (non-blocking)
		void (async () => {
			const group = apiGroupOf(entry);
			if (group === '') return;
			const rating = await this.api.fetchCommunityRating(entry, this.settings.get().animeApiSource ?? 'jikan', group);
			if (rating) this.titles.updateCommunityRating(entry.id, rating.rating, rating.votes, rating.source);
		})();

		await this.addToGroup(entry.id);
		new Notice(t('add.added', { name }));
		this.ctx.done({ kind: this.ctx.kind, id: entry.id });
	}

	private async addToGroup(titleId: string): Promise<void> {
		if (this.group.selectedGroupId) {
			await this.titles.addTitleToGroup(this.group.selectedGroupId, titleId);
			return;
		}
		const name = this.group.newGroupName.trim();
		if (!name) return;
		const group: HoardGroup = {
			id: this.titles.generateGroupId(name),
			name,
			titleIds: [titleId],
			dateAdded: new Date().toISOString(),
		};
		await this.titles.addGroup(group);
	}
}

/**
 * Mounts the form that saves a watchlist entry (or a Maybe note) into `host`. `result` is the
 * picked search row; null is a manual entry with the typed query as its title.
 */
export function mountTitleAddForm(
	host: HTMLElement,
	settings: SettingsReader & SettingsWriter,
	titles: AddTitleStore,
	api: AddTitleApi,
	ctx: AddFormContext,
	result: TitleSearchResult | null,
): AddFormHandle {
	const form = new TitleAddForm(host, settings, titles, api, ctx, result);
	form.start();
	return form;
}
