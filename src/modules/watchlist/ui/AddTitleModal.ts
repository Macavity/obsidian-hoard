import { App, Notice } from 'obsidian';
import type { DataManager } from '../services/DataManager';
import type { ApiService } from '../../../shared/api/ApiService';
import type { SettingsReader, SettingsWriter } from '../../settings/exports';
import type { HoardGroup, HoardTitle, Season } from '../domain/model';
import { todayIso } from '../../../shared/domain/date';
import { apiGroupOf, type SourceType } from '../../../shared/domain/sourceType';
import { completedEpisodes } from '../domain/completedEpisodes';
import { newTitle } from '../domain/newTitle';
import { nonEmpty } from '../../../shared/domain/sharedHelpers';
import { t } from '../../../shared/i18n';
import { found, type LookupResult } from '../../../shared/api/lookup';
import { priorityLabel, statusLabel } from '../../../shared/i18n/labels';
import { renderSearchResultRow } from '../../../design-system/SearchThumbnail';
import {
	episodesLabel,
	fillMediaFields,
	resolvePick,
	resultIdKeys,
	searchTitles,
	titlePickerBase,
	type TitlePick,
	type TitleSearchApi,
	type TitleSearchResult,
	type MediaFields,
} from '../../../shared/services/titleSearch';
import { SearchFormModal, type SearchPickerOptions } from '../../../design-system/SearchFormModal';
import { LibraryIndex } from '../../../shared/services/LibraryIndex';
import { effectiveMediaSource } from '../../../shared/api/apiSources';
import { createDatePicker } from '../../../design-system/DatePicker';
import { renderStarRating } from '../../../design-system/StarRating';
import { blockDuplicate, createDuplicateGuard } from '../../../design-system/DuplicateGuard';
import {
	makeCell,
	makeRow as makeFormRow,
	renderMediaAndTypeFields,
	nameSelect,
	renderGroupPicker,
	resetForm,
	type GroupPickerState,
} from '../../../design-system/FormCells';

export type AddTitleStore = Pick<
	DataManager,
	| 'getTitles' | 'getGroups' | 'generateId' | 'generateGroupId' | 'addTitle' | 'addTitleToGroup' | 'addGroup'
	| 'recordLookup' | 'updateCommunityRating'
>;
export type AddTitleApi = TitleSearchApi & Pick<ApiService, 'fetchCommunityRating'>;

export interface AddTitlePrefill {
	title?: string;
	searchQuery?: string;
	type?: string;
	sourceType: SourceType;
	episodes: number;
	duration: number;
	releaseDate: string;
	link: string;
	seasons: Season[];
	trailerUrl?: string;
	director?: string[];
	cast?: string[];
}

export interface AddTitleOptions {
	/** Gets the new entry — callers that don't care just ignore it. */
	onAdded: (entry: HoardTitle) => void;
	prefill?: AddTitlePrefill;
}

export type OpenAddTitle = (opts: AddTitleOptions) => void;

export class AddTitleModal extends SearchFormModal<TitleSearchResult> {
	private selectedSourceType: SourceType = 'Anime';
	private selectedType = 'Anime';
	private initialQuery = '';

	private media: MediaFields = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };
	private fieldSeasons: Season[] = [];
	private fieldStatus = 'Plan to watch';
	private fieldPriority = 'Medium';
	private fieldRating = 0;
	private fieldDateStarted = '';
	private fieldMalId: number | null = null;
	private fieldAnilistId: number | null = null;
	// trailer resolved at selection (undefined = not fetched yet); a miss or failure is recorded on add
	private fieldTrailer: LookupResult<string> | undefined;
	// credits resolved at selection ([] unfetched, or names)
	private fieldDirector: string[] = [];
	private fieldCast: string[] = [];
	private fieldStudio: string[] = [];
	private fieldPosterUrl = '';
	private duplicates = createDuplicateGuard();
	// built on first search, reused for the modal's life
	private libIndex: LibraryIndex | null = null;

	private group: GroupPickerState = { selectedGroupId: '', newGroupName: '' };

	constructor(
		app: App,
		private readonly settings: SettingsReader & SettingsWriter,
		private readonly titles: AddTitleStore,
		private readonly api: AddTitleApi,
		resolveDefaultAddType: () => string,
		private readonly opts: AddTitleOptions,
	) {
		super(app, t('add.title.heading'), ['hoard-add-modal']);
		// preselect the resolved default type; a prefill type overrides it, and a type no longer in settings falls back to the first
		this.selectedType = opts.prefill?.type || resolveDefaultAddType() || this.selectedType;
		const names = settings.get().types.map((ty) => ty.name);
		if (names.length > 0 && !names.includes(this.selectedType)) this.selectedType = names[0]!;
		if (opts.prefill) this.applyPrefill(opts.prefill);
	}

	private applyPrefill(prefill: AddTitlePrefill): void {
		this.selectedSourceType = prefill.sourceType;
		if (prefill.title) this.media.title = prefill.title;
		if (prefill.searchQuery) this.initialQuery = prefill.searchQuery;
		this.media.episodes = prefill.episodes;
		this.media.duration = prefill.duration;
		this.media.releaseDate = prefill.releaseDate;
		this.media.link = prefill.link;
		this.fieldSeasons = prefill.seasons;
		if (prefill.trailerUrl) this.fieldTrailer = found(prefill.trailerUrl);
		if (prefill.director !== undefined) this.fieldDirector = prefill.director;
		if (prefill.cast !== undefined) this.fieldCast = prefill.cast;
	}

	protected pickerOptions(): SearchPickerOptions<TitleSearchResult> {
		return {
			...titlePickerBase(this.selectedSourceType, (v) => { this.selectedSourceType = v; }),
			grid: true,
			initialQuery: this.initialQuery,
		};
	}

	protected async search(query: string, year: string): Promise<TitleSearchResult[]> {
		return await searchTitles(this.settings, this.api, this.selectedSourceType, query, year);
	}

	protected noApiMessage(): string | null {
		return null;
	}

	protected renderResult(host: HTMLElement, result: TitleSearchResult, select: (itemEl: HTMLElement) => void): HTMLElement {
		if (!this.libIndex) this.libIndex = LibraryIndex.build({ watchlist: () => this.titles.getTitles() }, ['watchlist']);
		const idKeys = resultIdKeys(result, effectiveMediaSource(this.settings.get(), this.api));
		return renderSearchResultRow(host, {
			thumbUrl: result.posterUrl,
			fallbackIcon: '🎬',
			title: result.title,
			meta: `${episodesLabel(result)} · ${result.releaseDate}`,
			inLibrary: this.libIndex.lookup(idKeys, result.title),
			onClick: select,
		});
	}

	protected async selectResult(result: TitleSearchResult, isCurrent: () => boolean): Promise<void> {
		if (await resolvePick(this.settings, this.api, result, isCurrent, (pick) => this.applyPick(pick))) this.renderForm();
	}

	private applyPick(pick: TitlePick): void {
		fillMediaFields(this.media, pick);
		this.fieldSeasons = pick.seasons;
		this.fieldTrailer = pick.trailer;
		this.fieldDirector = pick.director;
		this.fieldCast = pick.cast;
		this.fieldStudio = pick.studio;
		this.fieldPosterUrl = pick.posterUrl ?? '';
		if (pick.animeIds) {
			this.fieldMalId = pick.animeIds.malId;
			this.fieldAnilistId = pick.animeIds.anilistId;
		}
	}

	protected renderForm(): void {
		const form = resetForm(this.formEl);
		if (!form) return;
		const makeRow = (label: string): HTMLElement => makeFormRow(form, label);

		renderMediaAndTypeFields(form, this.media, true, {
			names: this.settings.get().types.map((ty) => ty.name),
			selected: this.selectedType,
			onChange: (v) => { this.selectedType = v; },
		});

		// status + priority paired 50/50 (status excludes "To be released" — it follows releaseDate)
		const statusPriRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const statuses = this.settings.get().statuses.filter((s) => s.name !== 'To be released');
		nameSelect(makeCell(statusPriRow, t('add.status')), statuses.map((s) => s.name), this.fieldStatus,
			(v) => { this.fieldStatus = v; }, false, statusLabel);
		nameSelect(makeCell(statusPriRow, t('add.priority'), true), this.settings.get().priorities.map((p) => p.name),
			this.fieldPriority, (v) => { this.fieldPriority = v; }, false, priorityLabel);

		const ratingRow = makeRow(t('add.rating'));
		const starsWrap = ratingRow.createDiv({ cls: 'hoard-star-rating--row' });
		const paintStars = (): void => {
			renderStarRating(starsWrap, this.fieldRating, {
				allowHalf: this.settings.get().halfStarRatings ?? false,
				tiers: this.settings.get().ratingSystem,
				showLabel: true,
				onChange: (value) => { this.fieldRating = value; paintStars(); },
			});
		};
		paintStars();

		const startRow = makeRow(t('add.dateStarted'));
		createDatePicker({
			parent: startRow,
			inputCls: 'hoard-modal__input',
			value: this.fieldDateStarted || null,
			onChange: (iso) => { this.fieldDateStarted = iso ?? ''; },
		});

		renderGroupPicker(form, this.titles.getGroups(), this.group);

		if (this.fieldSeasons.length > 0) {
			const seasRow = makeRow(t('add.seasons'));
			seasRow.createSpan({
				cls: 'hoard-modal__info',
				text: this.fieldSeasons
					.map((s) => t('add.title.seasonEpisodes', { name: s.name, count: s.episodes }))
					.join(', '),
			});
		}

		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const addBtn = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('add.title.submit') });
		addBtn.addEventListener('click', () => void this.addTitle());
	}

	private async addTitle(): Promise<void> {
		const titleName = this.media.title.trim();
		if (!titleName) {
			new Notice(t('add.title.emptyName'));
			return;
		}

		const isDuplicate = this.titles.getTitles().some(
			(t) => t.title.toLowerCase() === titleName.toLowerCase()
		);
		const blocked = blockDuplicate(this.contentEl, this.duplicates, {
			name: titleName,
			isDuplicate,
			verb: 'Add',
			retry: () => void this.addTitle(),
		});
		if (blocked) return;

		// added as Completed: every episode is ticked, and the finish date set when the setting asks for it
		const allEpisodes = completedEpisodes(this.fieldStatus, this.media.episodes);
		const entry = newTitle({
			id: this.titles.generateId(titleName),
			title: titleName,
			type: this.selectedType,
			sourceType: this.selectedSourceType,
			status: this.fieldStatus,
			priority: this.fieldPriority,
			rating: this.fieldRating,
			dateStarted: this.fieldDateStarted || null,
			dateFinished: allEpisodes && this.settings.get().setFinishDateAutomatically ? todayIso() : null,
			totalEpisodes: this.media.episodes,
			episodeDuration: this.media.duration,
			releaseDate: this.media.releaseDate || null,
			externalLink: this.media.link,
			seasons: this.fieldSeasons,
			watchedEpisodes: allEpisodes,
			favorite: false,
			posterUrl: this.fieldPosterUrl,
			trailerUrl: this.fieldTrailer?.status === 'found' ? this.fieldTrailer.value : '',
			manualTrailerUrl: '',
			// empty stays absent (= unfetched) so the detail modal's lazy backfill runs
			director: nonEmpty(this.fieldDirector),
			cast: nonEmpty(this.fieldCast),
			studio: nonEmpty(this.fieldStudio),
			malId: this.fieldMalId ?? undefined,
			anilistId: this.fieldAnilistId ?? undefined,
		});

		await this.titles.addTitle(entry);
		if (this.fieldTrailer) this.titles.recordLookup(entry.id, 'trailer', this.fieldTrailer);

		// remember the type actually used so "Last type used" can follow it
		void this.settings.update((s) => { s.lastAddedType = entry.type; });

		// fire-and-forget community rating fetch (non-blocking)
		void (async () => {
			const animeSource = this.settings.get().animeApiSource ?? 'jikan';
			const group = apiGroupOf(entry);
			if (group === '') return;
			const result = await this.api.fetchCommunityRating(entry, animeSource, group);
			if (result) {
				this.titles.updateCommunityRating(entry.id, result.rating, result.votes, result.source);
			}
		})();

		if (this.group.selectedGroupId) {
			await this.titles.addTitleToGroup(this.group.selectedGroupId, entry.id);
		} else if (this.group.newGroupName.trim()) {
			const name = this.group.newGroupName.trim();
			const group: HoardGroup = {
				id: this.titles.generateGroupId(name),
				name,
				titleIds: [entry.id],
				dateAdded: new Date().toISOString(),
			};
			await this.titles.addGroup(group);
		}

		new Notice(t('add.added', { name: titleName }));
		this.close();
		this.opts.onAdded(entry);
	}
}
