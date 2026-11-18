import { App, Notice } from 'obsidian';
import type { DataManager } from '../services/DataManager';
import type { ApiService } from '../../../shared/api/ApiService';
import type { SettingsReader, SettingsWriter } from '../../../shared/services/SettingsService';
import type { HoardTitle, HoardGroup, Season } from '../../../shared/domain/types';
import { getApiGroupForType, todayIso } from '../../../shared/domain/types';
import { completedEpisodes, newTitle } from '../../../shared/domain/entryFactories';
import { nonEmpty } from '../../../shared/storage/sharedHelpers';
import { t } from '../../../shared/i18n';
import { found, type LookupResult } from '../../../shared/api/lookup';
import { priorityLabel, statusLabel } from '../../../shared/i18n/labels';
import { renderSearchResultRow } from '../../../shared/ui/SearchThumbnail';
import {
	episodesLabel,
	fillMediaFields,
	resolvePick,
	resultIdKeys,
	searchTitles,
	titlePickerBase,
	type TitlePick,
	type TitleSearchDeps,
	type TitleSearchResult,
} from './titleSearch';
import { SearchFormModal, type SearchPickerOptions } from '../../../shared/ui/SearchFormModal';
import { LibraryIndex } from '../../../shared/services/LibraryIndex';
import { effectiveMediaSource } from '../../../shared/api/apiSources';
import { createDatePicker } from '../../../shared/ui/DatePicker';
import { renderStarRating } from '../../../shared/ui/StarRating';
import { blockDuplicate, createDuplicateGuard } from '../../../shared/ui/DuplicateGuard';
import {
	makeCell,
	makeRow as makeFormRow,
	nameSelect,
	renderGroupPicker,
	renderMediaFields,
	resetForm,
	type GroupPickerState,
	type MediaFields,
} from '../../../shared/ui/FormCells';

export interface AddTitleModalDeps extends TitleSearchDeps {
	app: App;
	settings: SettingsReader & SettingsWriter;
	titles: Pick<
		DataManager,
		| 'getTitles' | 'getGroups' | 'generateId' | 'generateGroupId' | 'addTitle' | 'addTitleToGroup' | 'addGroup'
		| 'recordLookup' | 'updateCommunityRating'
	>;
	api: TitleSearchDeps['api'] & Pick<ApiService, 'fetchCommunityRating'>;
	/** The type the form preselects (the user's default, or the last one used). */
	resolveDefaultAddType: () => string;
}

export class AddTitleModal extends SearchFormModal<TitleSearchResult> {
	// gets the new entry — callers that don't care just ignore it
	private onAdded: (entry: HoardTitle) => void;

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
		private deps: AddTitleModalDeps,
		onAdded: (entry: HoardTitle) => void,
		prefill?: {
			title?: string;
			searchQuery?: string;
			type: string;
			episodes: number;
			duration: number;
			releaseDate: string;
			link: string;
			seasons: Season[];
			trailerUrl?: string;
			director?: string[];
			cast?: string[];
		},
	) {
		super(deps.app, t('add.title.heading'), ['hoard-add-modal']);
		this.onAdded = onAdded;
		// preselect the resolved default type; a prefill type (e.g. from URL detection) overrides it below
		this.selectedType = this.deps.resolveDefaultAddType() || this.selectedType;
		if (prefill) {
			this.selectedType = prefill.type;
			if (prefill.title) {
				this.media.title = prefill.title;
			}
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
	}

	protected pickerOptions(): SearchPickerOptions<TitleSearchResult> {
		return {
			...titlePickerBase(this.deps, this.selectedType, (v) => {
				this.selectedType = v;
				this.renderForm();
			}),
			grid: true,
			initialQuery: this.initialQuery,
		};
	}

	protected async search(query: string, year: string): Promise<TitleSearchResult[]> {
		return (await searchTitles(this.deps, this.selectedType, query, year)) ?? [];
	}

	protected noApiMessage(): string | null {
		if (getApiGroupForType(this.selectedType, this.deps.settings.get().typeApiMapping) !== '') return null;
		return t('add.title.noApi', { type: this.selectedType });
	}

	protected renderResult(host: HTMLElement, result: TitleSearchResult, select: (itemEl: HTMLElement) => void): HTMLElement {
		if (!this.libIndex) this.libIndex = LibraryIndex.build({ watchlist: () => this.deps.titles.getTitles() }, ['watchlist']);
		const idKeys = resultIdKeys(result, effectiveMediaSource(this.deps.settings.get(), this.deps.api));
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
		if (await resolvePick(this.deps, result, isCurrent, (pick) => this.applyPick(pick))) this.renderForm();
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

		renderMediaFields(form, this.media, true);

		// status + priority paired 50/50 (status excludes "To be released" — it follows releaseDate)
		const statusPriRow = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const statuses = this.deps.settings.get().statuses.filter((s) => s.name !== 'To be released');
		nameSelect(makeCell(statusPriRow, t('add.status')), statuses.map((s) => s.name), this.fieldStatus,
			(v) => { this.fieldStatus = v; }, false, statusLabel);
		nameSelect(makeCell(statusPriRow, t('add.priority'), true), this.deps.settings.get().priorities.map((p) => p.name),
			this.fieldPriority, (v) => { this.fieldPriority = v; }, false, priorityLabel);

		const ratingRow = makeRow(t('add.rating'));
		const starsWrap = ratingRow.createDiv({ cls: 'hoard-star-rating--row' });
		const paintStars = (): void => {
			renderStarRating(starsWrap, this.fieldRating, {
				allowHalf: this.deps.settings.get().halfStarRatings ?? false,
				tiers: this.deps.settings.get().ratingSystem,
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

		renderGroupPicker(form, this.deps.titles.getGroups(), this.group);

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

		const isDuplicate = this.deps.titles.getTitles().some(
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
			id: this.deps.titles.generateId(titleName),
			title: titleName,
			type: this.selectedType,
			status: this.fieldStatus,
			priority: this.fieldPriority,
			rating: this.fieldRating,
			dateStarted: this.fieldDateStarted || null,
			dateFinished: allEpisodes && this.deps.settings.get().setFinishDateAutomatically ? todayIso() : null,
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

		await this.deps.titles.addTitle(entry);
		if (this.fieldTrailer) this.deps.titles.recordLookup(entry.id, 'trailer', this.fieldTrailer);

		// remember the type actually used so "Last type used" can follow it
		void this.deps.settings.update((s) => { s.lastAddedType = entry.type; });

		// fire-and-forget community rating fetch (non-blocking)
		void (async () => {
			const animeSource = this.deps.settings.get().animeApiSource ?? 'jikan';
			const group = getApiGroupForType(entry.type, this.deps.settings.get().typeApiMapping);
			if (group === '') return;
			const result = await this.deps.api.fetchCommunityRating(entry, animeSource, group);
			if (result) {
				this.deps.titles.updateCommunityRating(entry.id, result.rating, result.votes, result.source);
			}
		})();

		if (this.group.selectedGroupId) {
			await this.deps.titles.addTitleToGroup(this.group.selectedGroupId, entry.id);
		} else if (this.group.newGroupName.trim()) {
			const name = this.group.newGroupName.trim();
			const group: HoardGroup = {
				id: this.deps.titles.generateGroupId(name),
				name,
				titleIds: [entry.id],
				dateAdded: new Date().toISOString(),
			};
			await this.deps.titles.addGroup(group);
		}

		new Notice(t('add.added', { name: titleName }));
		this.close();
		this.onAdded(entry);
	}
}
