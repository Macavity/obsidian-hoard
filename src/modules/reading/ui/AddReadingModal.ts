import { App, FuzzySuggestModal, Modal, Notice, TFile, type Vault, type Workspace } from 'obsidian';
import type { SettingsReader } from '../../../shared/services/SettingsService';
import type { ReadingDataManager } from '../services/ReadingDataManager';
import { newBook, newManga } from '../../../shared/domain/entryFactories';
import type { ApiService, BookSearchResult, MangaSearchResult } from '../../../shared/api/ApiService';
import { apiErrorMessage } from '../../../shared/api/ApiService';
import { renderSearchResultRow } from '../../../shared/ui/SearchThumbnail';
import type { searchBooks, BookSearchApi } from '../../covers/services/coverRefresh';
import { LibraryIndex, bookResultIdKeys, mangaResultIdKeys } from '../../../shared/services/LibraryIndex';
import { renderStarRating } from '../../../shared/ui/StarRating';
import { createDatePicker } from '../../../shared/ui/DatePicker';
import { renderSegmentedToggle } from '../../../shared/ui/StatusDropdown';
import { t } from '../../../shared/i18n';
import { readingStatusLabel } from '../../../shared/i18n/labels';
import {
	Book,
	BookProgressUnit,
	Manga,
	ReadingStatus,
	SELECTABLE_READING_STATUSES,
} from '../../../shared/domain/types';
import { markViewRoot } from '../../../shared/ui/detailFrame';

export type ReadingMode = 'book' | 'manga';

type LookupOutcome =
	| { kind: 'books'; results: BookSearchResult[] }
	| { kind: 'manga'; results: MangaSearchResult[] };

export interface ReadingFormState {
	title: string;
	author: string;
	status: ReadingStatus;
	rating: number;
	progressUnit: BookProgressUnit;
	pagesRead: number;
	totalPages: number;
	wordsRead: number;
	totalWords: number;
	chaptersRead: number;
	totalChapters: number;
	volumesRead: number;
	totalVolumes: number;
	coverUrl: string;
	googleBooksId: string;
	openLibraryId: string;
	malId: string;
	vaultPage: string;
	dateStarted: string | null;
	dateFinished: string | null;
	releaseDate: string | null;
}

function emptyFormState(): ReadingFormState {
	return {
		title: '',
		author: '',
		status: 'Plan to Read',
		rating: 0,
		progressUnit: 'pages',
		pagesRead: 0,
		totalPages: 0,
		wordsRead: 0,
		totalWords: 0,
		chaptersRead: 0,
		totalChapters: 0,
		volumesRead: 0,
		totalVolumes: 0,
		coverUrl: '',
		googleBooksId: '',
		openLibraryId: '',
		malId: '',
		vaultPage: '',
		dateStarted: null,
		dateFinished: null,
		releaseDate: null,
	};
}

export class VaultFilePicker extends FuzzySuggestModal<TFile> {
	private onPick: (file: TFile) => void;
	private files: TFile[];

	constructor(app: App, files: TFile[], onPick: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onPick = onPick;
		this.setPlaceholder(t('add.reading.pickNote'));
	}

	getItems(): TFile[] {
		return this.files;
	}
	getItemText(item: TFile): string {
		return item.path;
	}
	onChooseItem(item: TFile): void {
		this.onPick(item);
	}
}

type BookSearcher = typeof searchBooks;

export type AddReadingApi = BookSearchApi & Pick<ApiService, 'searchManga' | 'getMangaByMalId' | 'getGoogleBookById' | 'getOpenLibraryWork'>;

export interface AddReadingOptions {
	mode: ReadingMode;
	onSaved: () => void;
	/** Set when editing an existing item. */
	initial?: { state: ReadingFormState; id: string };
	prefillSearch?: string;
}

export type OpenAddReading = (opts: AddReadingOptions) => void;

export class AddReadingModal extends Modal {
	private state: ReadingFormState;
	private existingId: string | null;
	private starsWrap: HTMLElement | null = null;
	private lookupResultsEl: HTMLElement | null = null;
	private formEl: HTMLElement | null = null;
	private openVaultBtn: HTMLButtonElement | null = null;
	private linkVaultBtn: HTMLButtonElement | null = null;
	private lookupSearchGen = 0;
	private selectGen = 0;
	// cover last prefilled from an API result (or the cached one when editing); unchanged it is not an override
	private prefillSearch: string;
	private searchDebounce: number | null = null;
	// built on first lookup, reused for the modal's life
	private libIndex: LibraryIndex | null = null;

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly reading: ReadingDataManager,
		private readonly vault: Pick<Vault, 'getAbstractFileByPath'>,
		private readonly workspace: Pick<Workspace, 'getLeaf'>,
		/** Book search through the configured source (covers module). */
		private readonly searchBooks: BookSearcher,
		private readonly api: AddReadingApi,
		private readonly opts: AddReadingOptions,
	) {
		super(app);
		const { initial, prefillSearch } = opts;
		this.state = initial ? { ...initial.state } : emptyFormState();
		if (!initial) {
			const defStatus = reading.getSettings().defaultStatus;
			if (defStatus) this.state.status = defStatus;
		}
		this.existingId = initial?.id ?? null;
		this.prefillSearch = prefillSearch ?? '';
	}

	onOpen(): void {
		markViewRoot(this.modalEl, this.contentEl, this.settings.get().colorTheme);
		this.contentEl.addClass('hoard-reading-modal');
		this.contentEl.addClass(this.opts.mode === 'book' ? 'hoard-reading-modal--book' : 'hoard-reading-modal--manga');
		this.titleEl.setText(this.headerTitle());
		this.buildUI();
	}

	onClose(): void {
		if (this.searchDebounce) window.clearTimeout(this.searchDebounce);
		this.contentEl.empty();
	}

	private headerTitle(): string {
		if (this.existingId) {
			return this.opts.mode === 'book' ? t('add.reading.editBook') : t('add.reading.editManga');
		}
		return this.opts.mode === 'book' ? t('add.reading.addBook') : t('add.reading.addManga');
	}

	private buildUI(): void {
		const c = this.contentEl;
		c.empty();

		this.renderHeaderRow(c);
		this.renderLookupBar(c);
		c.createDiv({ cls: 'hoard-reading-modal__divider' });
		this.formEl = c.createDiv({ cls: 'hoard-reading-form__wrap' });
		this.renderForm(this.formEl);
		this.renderFooter(c);
	}

	private renderHeaderRow(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'hoard-reading-modal__header' });
		const left = row.createDiv({ cls: 'hoard-reading-modal__header-left' });
		left.createSpan({
			cls: 'hoard-reading-modal__header-icon',
			text: this.opts.mode === 'book' ? '📖' : '📓',
		});
		left.createSpan({
			cls: 'hoard-reading-modal__header-title',
			text: this.headerTitle(),
		});

		const actions = row.createDiv({ cls: 'hoard-reading-modal__header-actions' });
		// no "Link" button here on purpose — vault-page linking lives in ReadingDetailModal
		this.openVaultBtn = actions.createEl('button', {
			cls: 'hoard-btn hoard-btn--sm',
			text: t('add.reading.open'),
		});
		this.openVaultBtn.addEventListener('click', () => this.openLinkedVaultPage());
		this.refreshVaultButtons();
	}

	private refreshVaultButtons(): void {
		if (this.linkVaultBtn) {
			this.linkVaultBtn.textContent = this.state.vaultPage ? t('add.reading.changeLink') : t('add.reading.link');
			this.linkVaultBtn.title = this.state.vaultPage
				? t('add.reading.linked', { path: this.state.vaultPage })
				: t('add.reading.linkTip');
		}
		if (this.openVaultBtn) {
			const hasLink = !!this.state.vaultPage;
			this.openVaultBtn.disabled = !hasLink;
			this.openVaultBtn.toggleClass('is-hidden', !hasLink);
		}
	}

	private openLinkedVaultPage(): void {
		const path = this.state.vaultPage;
		if (!path) return;
		const file = this.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			void this.workspace.getLeaf('tab').openFile(file);
			this.close();
		} else {
			new Notice(t('add.reading.linkMissing'));
		}
	}

	private renderLookupBar(parent: HTMLElement): void {
		const lookup = parent.createDiv({ cls: 'hoard-reading-form__lookup' });
		const input = lookup.createEl('input', {
			cls: 'hoard-modal__input hoard-reading-form__lookup-input',
			attr: {
				type: 'text',
				placeholder: this.opts.mode === 'book'
					? t('add.reading.searchBook')
					: t('add.reading.searchManga'),
			},
		});
		const fetchBtn = lookup.createEl('button', {
			cls: 'hoard-btn hoard-reading-form__lookup-btn',
			text: t('common.search'),
		});
		this.lookupResultsEl = parent.createDiv({ cls: 'hoard-modal__results hoard-search-picker__results-grid' });

		const runFetch = (): void => {
			const q = input.value.trim();
			if (!q) {
				new Notice(t('add.reading.searchFirst'));
				return;
			}
			void this.performLookup(q);
		};

		// auto-search as you type (debounced), matching the Watchlist/Games add flows; the button and Enter
		// stay as manual triggers
		input.addEventListener('input', () => {
			if (this.searchDebounce) window.clearTimeout(this.searchDebounce);
			const q = input.value.trim();
			if (!q) return;
			this.searchDebounce = window.setTimeout(() => void this.performLookup(q), 600);
		});

		fetchBtn.addEventListener('click', runFetch);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				runFetch();
			}
		});

		// a prefilled search (e.g. from Drafts) fires immediately — the results are the point
		if (this.prefillSearch) {
			input.value = this.prefillSearch;
			void this.performLookup(this.prefillSearch);
		}
	}

	private async performLookup(query: string): Promise<void> {
		const gen = ++this.lookupSearchGen;
		if (!this.lookupResultsEl) return;
		this.lookupResultsEl.empty();
		this.lookupResultsEl.createDiv({ cls: 'hoard-modal__loading', text: t('ui.picker.searching') });

		try {
			const outcome = this.opts.mode === 'book'
				? await this.lookupBooks(query)
				: await this.lookupManga(query);
			if (gen !== this.lookupSearchGen) return;
			this.renderLookupOutcome(outcome);
		} catch (err) {
			if (gen !== this.lookupSearchGen) return;
			this.showLookupMessage('hoard-modal__error', apiErrorMessage(err));
		}
	}

	private renderLookupOutcome(outcome: LookupOutcome): void {
		if (outcome.kind === 'books') {
			this.renderLookupResults(outcome.results, '📖', (r) => this.applyBookResult(r), bookResultIdKeys);
		} else {
			this.renderLookupResults(outcome.results, '📓', (r) => this.applyMangaResult(r), mangaResultIdKeys);
		}
	}

	private showLookupMessage(cls: string, text: string): void {
		if (!this.lookupResultsEl) return;
		this.lookupResultsEl.empty();
		this.lookupResultsEl.createDiv({ cls, text });
	}

	private async lookupBooks(query: string): Promise<LookupOutcome> {
		return { kind: 'books', results: await this.searchBooks(this.api, this.settings.get(), query) };
	}

	private async lookupManga(query: string): Promise<LookupOutcome> {
		if (!/^\d+$/.test(query)) {
			return { kind: 'manga', results: await this.api.searchManga(query) };
		}
		const single = await this.api.getMangaByMalId(parseInt(query, 10));
		return { kind: 'manga', results: single ? [single] : [] };
	}

	/**
	 * Shared renderer for book and manga lookup results (they differ only by fallback icon and apply
	 * handler). Rows use the shared add-flow markup.
	 */
	private renderLookupResults<T extends { title: string; author: string; year: number; coverUrl: string }>(
		results: T[],
		fallbackIcon: string,
		onPick: (r: T) => void,
		idKeys: (r: T) => string[],
	): void {
		if (!this.lookupResultsEl) return;
		this.lookupResultsEl.empty();
		if (results.length === 0) {
			this.lookupResultsEl.createDiv({ cls: 'hoard-modal__loading', text: t('add.noMatches') });
			return;
		}
		// books check Books, manga check Manga — the two libraries stay separate
		if (!this.libIndex) {
			this.libIndex = LibraryIndex.build({
				books: () => this.reading.getBooks(),
				manga: () => this.reading.getMangaList(),
			}, [this.opts.mode === 'book' ? 'books' : 'manga']);
		}
		const libIndex = this.libIndex;
		for (const r of results) {
			const meta = [r.author || t('add.reading.unknownAuthor'), r.year ? String(r.year) : ''].filter(Boolean).join(' · ');
			renderSearchResultRow(this.lookupResultsEl, {
				thumbUrl: r.coverUrl,
				fallbackIcon,
				title: r.title || t('add.reading.untitled'),
				meta,
				inLibrary: libIndex.lookup(idKeys(r), r.title),
				onClick: () => onPick(r),
			});
		}
	}

	private applyBookResult(r: BookSearchResult): void {
		// always overwrite the auto-populated fields, so re-selecting a different result fully replaces the
		// previous selection
		const gen = ++this.selectGen;
		this.state.title = r.title;
		this.state.author = r.author;
		this.state.totalPages = r.totalPages;
		this.state.coverUrl = r.coverUrl;
		this.state.googleBooksId = r.googleBooksId;
		this.state.openLibraryId = r.openLibraryId;
		this.state.releaseDate = r.releaseDate ?? '';
		this.refreshForm();
		// keep the results list open so another result can be picked.
		// search results sometimes omit page counts and only return thumbnails — fetch the full record for
		// the selected book to upgrade both.
		if (r.googleBooksId || r.openLibraryId) void this.enrichBook(r, gen);
	}

	private async enrichBook(r: BookSearchResult, gen: number): Promise<void> {
		try {
			const api = this.api;
			const detail = r.googleBooksId ? await api.getGoogleBookById(r.googleBooksId) : await api.getOpenLibraryWork(r.openLibraryId);
			if (gen !== this.selectGen || !detail) return; // a newer selection superseded this one
			if (r.googleBooksId) this.applyGoogleDetail(detail);
			else this.applyOpenLibraryDetail(detail);
			this.refreshForm();
		} catch {
			// best-effort enrichment; the book is already applied from the search results
		}
	}

	private applyGoogleDetail(detail: BookSearchResult): void {
		if (detail.totalPages > 0) this.state.totalPages = detail.totalPages;
		if (detail.coverUrl) this.state.coverUrl = detail.coverUrl;
	}

	/** The work record only supplies a cover, and only while none is set: anything typed in the meantime wins. */
	private applyOpenLibraryDetail(detail: BookSearchResult): void {
		if (!this.state.coverUrl && detail.coverUrl) this.state.coverUrl = detail.coverUrl;
	}

	private applyMangaResult(r: MangaSearchResult): void {
		// always overwrite the auto-populated fields, so re-selecting a different result fully replaces the
		// previous selection
		const gen = ++this.selectGen;
		this.state.title = r.title;
		this.state.author = r.author;
		this.state.totalChapters = r.totalChapters;
		this.state.totalVolumes = r.totalVolumes;
		this.state.coverUrl = r.coverUrl;
		this.state.malId = r.malId > 0 ? String(r.malId) : '';
		this.state.releaseDate = r.releaseDate ?? '';
		this.refreshForm();
		// keep the results list open so another result can be picked.
		// search returns null chapters/volumes for ongoing titles — fetch detail only for the selected manga.
		if (r.malId > 0) {
			void (async () => {
				const detail = await this.api.getMangaByMalId(r.malId);
				if (gen !== this.selectGen || !detail) return; // superseded or no data
				this.state.totalChapters = detail.totalChapters > 0 ? detail.totalChapters : this.state.totalChapters;
				this.state.totalVolumes = detail.totalVolumes > 0 ? detail.totalVolumes : this.state.totalVolumes;
				this.refreshForm();
			})();
		}
	}

	private refreshForm(): void {
		if (!this.formEl) return;
		this.formEl.empty();
		this.renderForm(this.formEl);
	}

	private renderForm(parent: HTMLElement): void {
		const form = parent.createDiv({ cls: 'hoard-reading-form' });

		this.renderTextField(form, t('ui.form.title'), t('add.reading.bookTitlePlaceholder'), this.state.title, (v) => {
			this.state.title = v;
		});

		this.renderTextField(form, t('add.reading.author'), t('add.reading.authorPlaceholder'), this.state.author, (v) => {
			this.state.author = v;
		});

		this.renderStatusRatingRow(form);

		this.renderProgressOptionalGrid(form);
	}

	private renderProgressOptionalGrid(parent: HTMLElement): void {
		const grid = parent.createDiv({ cls: 'hoard-reading-form__grid' });

		const progressCol = grid.createDiv({ cls: 'hoard-reading-form__grid-column' });
		const progressLabel = progressCol.createDiv({ cls: 'hoard-reading-modal__section-label' });
		progressLabel.createSpan({ text: t('add.reading.progress') });
		if (this.opts.mode === 'book') {
			progressLabel.addClass('hoard-reading-modal__section-label--row');
			// Pages/Words switch: swaps which counter pair the form collects. The other unit's numbers stay in
			// state, so flipping back is lossless.
			renderSegmentedToggle<BookProgressUnit>({
				parent: progressLabel,
				options: [
					{ value: 'pages', label: t('add.reading.pages'), title: t('add.reading.pagesTip') },
					{ value: 'words', label: t('add.reading.words'), title: t('add.reading.wordsTip') },
				],
				value: this.state.progressUnit,
				onPick: (unit) => {
					this.state.progressUnit = unit;
					this.refreshForm();
				},
			});
		}
		if (this.opts.mode === 'book') {
			const inWords = this.state.progressUnit === 'words';
			this.renderTwoNumberRow(
				progressCol,
				inWords
					? { label: t('add.reading.wordsRead'), value: this.state.wordsRead, onChange: (n) => { this.state.wordsRead = n; } }
					: { label: t('add.reading.pagesRead'), value: this.state.pagesRead, onChange: (n) => { this.state.pagesRead = n; } },
				{ label: t('add.reading.chaptersRead'), value: this.state.chaptersRead, onChange: (n) => { this.state.chaptersRead = n; } },
			);
			this.renderTwoNumberRow(
				progressCol,
				inWords
					? { label: t('add.reading.totalWords'), value: this.state.totalWords, onChange: (n) => { this.state.totalWords = n; } }
					: { label: t('add.reading.totalPages'), value: this.state.totalPages, onChange: (n) => { this.state.totalPages = n; } },
				{ label: t('add.reading.totalChapters'), value: this.state.totalChapters, onChange: (n) => { this.state.totalChapters = n; } },
			);
		} else {
			this.renderTwoNumberRow(
				progressCol,
				{ label: t('add.reading.chaptersRead'), value: this.state.chaptersRead, onChange: (n) => { this.state.chaptersRead = n; } },
				{ label: t('add.reading.volumesRead'), value: this.state.volumesRead, onChange: (n) => { this.state.volumesRead = n; } },
			);
			this.renderTwoNumberRow(
				progressCol,
				{ label: t('add.reading.totalChapters'), value: this.state.totalChapters, onChange: (n) => { this.state.totalChapters = n; } },
				{ label: t('add.reading.totalVolumes'), value: this.state.totalVolumes, onChange: (n) => { this.state.totalVolumes = n; } },
			);
		}

		const optionalCol = grid.createDiv({ cls: 'hoard-reading-form__grid-column' });
		optionalCol.createDiv({ cls: 'hoard-reading-modal__section-label', text: t('add.reading.optional') });
		this.renderTextField(optionalCol, t('add.coverUrl'), 'https://...', this.state.coverUrl, (v) => {
			this.state.coverUrl = v;
		});
		this.renderDateField(optionalCol, t('add.reading.startDate'), this.state.dateStarted, (parsed) => {
			this.state.dateStarted = parsed;
		});
		this.renderDateField(optionalCol, t('ui.form.releaseDate'), this.state.releaseDate, (parsed) => {
			this.state.releaseDate = parsed;
		});
	}

	private renderTextField(
		parent: HTMLElement,
		label: string,
		placeholder: string,
		value: string,
		onChange: (v: string) => void,
	): void {
		const row = parent.createDiv({ cls: 'hoard-reading-form__row' });
		row.createSpan({ cls: 'hoard-reading-form__label', text: label });
		const input = row.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'text', placeholder },
		});
		input.value = value;
		input.addEventListener('input', () => onChange(input.value));
	}

	private renderStatusRatingRow(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'hoard-reading-form__status-rating-row' });

		const statusGroup = row.createDiv({ cls: 'hoard-reading-form__inline-group' });
		statusGroup.createSpan({ cls: 'hoard-reading-form__label', text: t('add.status') });
		const select = statusGroup.createEl('select', { cls: 'hoard-input__select hoard-reading-form__status-select' });
		for (const s of SELECTABLE_READING_STATUSES) {
			const opt = select.createEl('option', { text: readingStatusLabel(s), value: s });
			if (s === this.state.status) opt.selected = true;
		}
		select.addEventListener('change', () => {
			this.state.status = select.value as ReadingStatus;
		});

		const ratingGroup = row.createDiv({ cls: 'hoard-reading-form__inline-group' });
		ratingGroup.createSpan({ cls: 'hoard-reading-form__label', text: t('add.rating') });
		this.starsWrap = ratingGroup.createDiv({ cls: 'hoard-star-rating--row hoard-reading-form__stars' });
		this.renderStars();
	}

	private renderStars(): void {
		if (!this.starsWrap) return;
		renderStarRating(this.starsWrap, this.state.rating, {
			allowHalf: this.settings.get().halfStarRatings ?? false,
			tiers: this.settings.get().ratingSystem,
			showLabel: true,
			onChange: (value) => {
				this.state.rating = value;
				this.renderStars();
			},
		});
	}

	private renderTwoNumberRow(
		parent: HTMLElement,
		left: { label: string; value: number; onChange: (n: number) => void },
		right: { label: string; value: number; onChange: (n: number) => void },
	): void {
		const row = parent.createDiv({ cls: 'hoard-reading-form__row hoard-reading-form__row--split' });
		this.renderNumberCol(row, left);
		this.renderNumberCol(row, right);
	}

	private renderNumberCol(
		parent: HTMLElement,
		field: { label: string; value: number; onChange: (n: number) => void },
	): void {
		const col = parent.createDiv({ cls: 'hoard-reading-form__column' });
		col.createSpan({ cls: 'hoard-reading-form__label', text: field.label });
		const input = col.createEl('input', {
			cls: 'hoard-modal__input hoard-modal__input--sm',
			attr: { type: 'number', min: '0' },
		});
		input.value = String(field.value);
		input.addEventListener('input', () => {
			const n = parseInt(input.value, 10);
			field.onChange(isNaN(n) || n < 0 ? 0 : n);
		});
	}

	private renderDateField(
		parent: HTMLElement,
		label: string,
		value: string | null,
		onParsed: (parsed: string | null) => void,
	): void {
		const row = parent.createDiv({ cls: 'hoard-reading-form__row' });
		row.createSpan({ cls: 'hoard-reading-form__label', text: label });
		createDatePicker({
			parent: row,
			inputCls: 'hoard-modal__input',
			value,
			onChange: onParsed,
		});
	}

	private renderFooter(parent: HTMLElement): void {
		const footer = parent.createDiv({ cls: 'hoard-reading-modal__footer' });
		const cancelBtn = footer.createEl('button', { cls: 'hoard-btn', text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = footer.createEl('button', {
			cls: 'hoard-reading-modal__add-btn hoard-btn--success hoard-reading-modal__save',
			text: this.saveButtonLabel(),
		});
		saveBtn.addEventListener('click', () => void this.save());
	}

	private saveButtonLabel(): string {
		if (this.existingId) return t('add.saveChanges');
		return this.opts.mode === 'book' ? t('add.reading.addBook') : t('add.reading.addManga');
	}

	private async save(): Promise<void> {
		const title = this.state.title.trim();
		if (!title) {
			new Notice(t('add.reading.emptyTitle'));
			return;
		}

		if (this.opts.mode === 'book') {
			await this.saveBook(title);
		} else {
			await this.saveManga(title);
		}
		this.opts.onSaved();
		this.close();
	}

	private bookFormFields(): Omit<Book, 'id' | 'title' | 'dateAdded' | 'dateModified' | 'customFields'> {
		const s = this.state;
		return {
			author: s.author.trim(),
			status: s.status,
			rating: s.rating,
			progressUnit: s.progressUnit,
			pagesRead: s.pagesRead,
			totalPages: s.totalPages,
			wordsRead: s.wordsRead,
			totalWords: s.totalWords,
			chaptersRead: s.chaptersRead,
			totalChapters: s.totalChapters,
			coverUrl: s.coverUrl.trim(),
			googleBooksId: s.googleBooksId.trim(),
			openLibraryId: s.openLibraryId.trim(),
			vaultPage: s.vaultPage,
			dateStarted: s.dateStarted,
			dateFinished: s.dateFinished,
			releaseDate: s.releaseDate,
		};
	}

	private async saveBook(title: string): Promise<void> {
		if (this.existingId) {
			const existing = this.reading.getBook(this.existingId);
			if (!existing) {
				new Notice(t('add.reading.bookGone'));
				return;
			}
			const updated: Book = {
				...existing,
				title,
				...this.bookFormFields(),
			};
			await this.reading.updateBook(updated);
		} else {
			await this.reading.addBook(newBook({
				id: this.reading.generateBookId(title),
				title,
				...this.bookFormFields(),
			}));
		}
	}

	private mangaFormFields(): Omit<Manga, 'id' | 'title' | 'dateAdded' | 'dateModified' | 'customFields'> {
		const s = this.state;
		return {
			author: s.author.trim(),
			status: s.status,
			rating: s.rating,
			chaptersRead: s.chaptersRead,
			totalChapters: s.totalChapters,
			volumesRead: s.volumesRead,
			totalVolumes: s.totalVolumes,
			coverUrl: s.coverUrl.trim(),
			malId: s.malId.trim(),
			vaultPage: s.vaultPage,
			dateStarted: s.dateStarted,
			dateFinished: s.dateFinished,
			releaseDate: s.releaseDate,
		};
	}

	private async saveManga(title: string): Promise<void> {
		if (this.existingId) {
			const existing = this.reading.getManga(this.existingId);
			if (!existing) {
				new Notice(t('add.reading.mangaGone'));
				return;
			}
			const updated: Manga = {
				...existing,
				title,
				...this.mangaFormFields(),
			};
			await this.reading.updateManga(updated);
		} else {
			await this.reading.addManga(newManga({
				id: this.reading.generateMangaId(title),
				title,
				...this.mangaFormFields(),
			}));
		}
	}
}
