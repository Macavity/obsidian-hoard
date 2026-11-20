import { Notice } from 'obsidian';
import type { ReadingDataManager } from '../services/ReadingDataManager';
import type { ApiService, BookSearchResult, MangaSearchResult } from '../../../shared/api/ApiService';
import type { searchBooks, BookSearchApi } from '../../../shared/services/coverRefresh';
import type { AddFormContext, AddFormHandle } from '../../add/exports';
import { newBook, newManga } from '../domain/newReading';
import type { BookProgressUnit, ReadingStatus } from '../domain/model';
import { SELECTABLE_READING_STATUSES } from '../domain/readingDefaults';
import { t, type TranslationKey } from '../../../shared/i18n';
import { readingStatusLabel } from '../../../shared/i18n/labels';
import type { SettingsReader } from '../../settings/exports';
import { createDatePicker } from '../../../design-system/DatePicker';
import { blockDuplicate, createDuplicateGuard } from '../../../design-system/DuplicateGuard';
import { makeCell, makeRow, nameSelect, numberInput, releaseDateField, renderRatingRow, textInput, titleField } from '../../../design-system/FormCells';
import { renderSegmentedToggle } from '../../../design-system/StatusDropdown';

export type BookSearcher = typeof searchBooks;

export type AddReadingApi = BookSearchApi
	& Pick<ApiService, 'searchManga' | 'getMangaByMalId' | 'getGoogleBookById' | 'getOpenLibraryWork' | 'getAniListMangaMalId'>;

export type AddReadingStore = Pick<
	ReadingDataManager,
	'getBooks' | 'getMangaList' | 'getSettings' | 'generateBookId' | 'addBook' | 'generateMangaId' | 'addManga'
>;

/** The search row a form was opened from; a manual entry has none. */
export type ReadingRow =
	| { kind: 'book'; result: BookSearchResult }
	| { kind: 'manga'; result: MangaSearchResult };

type CounterField =
	| 'pagesRead' | 'totalPages' | 'wordsRead' | 'totalWords'
	| 'chaptersRead' | 'totalChapters' | 'volumesRead' | 'totalVolumes';

/** A counter input: which number it edits and its label. */
type CounterSpec = [CounterField, TranslationKey];

class ReadingAddForm implements AddFormHandle {
	private readonly isBook: boolean;
	private title = '';
	private author = '';
	private status: ReadingStatus = 'Plan to Read';
	private rating = 0;
	private progressUnit: BookProgressUnit = 'pages';
	private readonly counters: Record<CounterField, number> = {
		pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0,
		chaptersRead: 0, totalChapters: 0, volumesRead: 0, totalVolumes: 0,
	};
	private coverUrl = '';
	private googleBooksId = '';
	private openLibraryId = '';
	private malId = '';
	private dateStarted: string | null = null;
	private releaseDate: string | null = null;
	private readonly duplicates = createDuplicateGuard();
	private destroyed = false;

	constructor(
		private readonly host: HTMLElement,
		private readonly settings: SettingsReader,
		private readonly reading: AddReadingStore,
		private readonly api: AddReadingApi,
		private readonly ctx: AddFormContext,
		private readonly row: ReadingRow | null,
	) {
		this.isBook = ctx.kind === 'book';
		const defaultStatus = reading.getSettings().defaultStatus;
		if (defaultStatus) this.status = defaultStatus;
	}

	start(): void {
		if (!this.row) this.title = this.ctx.query;
		else if (this.row.kind === 'book') this.applyBook(this.row.result);
		else this.applyManga(this.row.result);
		this.render();
		if (this.row?.kind === 'book') void this.enrichBook(this.row.result);
		else if (this.row?.kind === 'manga') void this.enrichManga(this.row.result);
	}

	destroy(): void {
		this.destroyed = true;
		this.host.empty();
	}

	private applyBook(r: BookSearchResult): void {
		this.title = r.title;
		this.author = r.author;
		this.counters.totalPages = r.totalPages;
		this.coverUrl = r.coverUrl;
		this.googleBooksId = r.googleBooksId;
		this.openLibraryId = r.openLibraryId;
		this.releaseDate = r.releaseDate || null;
	}

	private applyManga(r: MangaSearchResult): void {
		this.title = r.title;
		this.author = r.author;
		this.counters.totalChapters = r.totalChapters;
		this.counters.totalVolumes = r.totalVolumes;
		this.coverUrl = r.coverUrl;
		this.malId = r.malId > 0 ? String(r.malId) : '';
		this.releaseDate = r.releaseDate || null;
	}

	/** Search rows sometimes omit page counts and covers, so the picked book's full record upgrades them. */
	private async enrichBook(r: BookSearchResult): Promise<void> {
		if (!r.googleBooksId && !r.openLibraryId) return;
		try {
			const detail = r.googleBooksId
				? await this.api.getGoogleBookById(r.googleBooksId)
				: await this.api.getOpenLibraryWork(r.openLibraryId);
			if (this.destroyed || !detail) return;
			if (r.googleBooksId) {
				if (detail.totalPages > 0) this.counters.totalPages = detail.totalPages;
				if (detail.coverUrl) this.coverUrl = detail.coverUrl;
			} else if (!this.coverUrl && detail.coverUrl) {
				// the work record only supplies a cover, and only while none is set: anything typed in the meantime wins
				this.coverUrl = detail.coverUrl;
			}
			this.render();
		} catch {
			// best-effort: the book is already applied from the search row
		}
	}

	/** Search lists return null chapters/volumes for ongoing titles, so the picked manga's detail fills them. */
	private async enrichManga(r: MangaSearchResult): Promise<void> {
		if (r.malId <= 0) return;
		try {
			const detail = await this.api.getMangaByMalId(r.malId);
			if (this.destroyed || !detail) return;
			if (detail.totalChapters > 0) this.counters.totalChapters = detail.totalChapters;
			if (detail.totalVolumes > 0) this.counters.totalVolumes = detail.totalVolumes;
			this.render();
		} catch {
			// best-effort: the manga is already applied from the search row
		}
	}

	private render(): void {
		this.host.empty();
		const form = this.host.createDiv({ cls: 'hoard-modal__form' });
		titleField(form, this.title, t('add.reading.bookTitlePlaceholder'), (v) => { this.title = v; });
		textInput(makeRow(form, t('add.reading.author')), {
			value: this.author,
			placeholder: t('add.reading.authorPlaceholder'),
			onInput: (v) => { this.author = v; },
		});
		nameSelect(makeRow(form, t('add.status')), SELECTABLE_READING_STATUSES, this.status,
			(v) => { this.status = v as ReadingStatus; }, false, readingStatusLabel);
		this.renderRating(form);
		this.renderProgress(form);
		textInput(makeRow(form, t('add.coverUrl')), { value: this.coverUrl, placeholder: 'https://...', onInput: (v) => { this.coverUrl = v; } });
		createDatePicker({
			parent: makeRow(form, t('add.reading.startDate')),
			inputCls: 'hoard-modal__input',
			value: this.dateStarted,
			onChange: (iso) => { this.dateStarted = iso; },
		});
		releaseDateField(form, this.releaseDate ?? '', (iso) => { this.releaseDate = iso || null; });

		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const submit = btnRow.createEl('button', {
			cls: 'hoard-btn hoard-btn--primary',
			text: t(this.isBook ? 'add.reading.addBook' : 'add.reading.addManga'),
		});
		submit.addEventListener('click', () => void this.save());
	}

	private renderRating(form: HTMLElement): void {
		renderRatingRow(
			form,
			this.rating,
			{ allowHalf: this.settings.get().halfStarRatings ?? false, tiers: this.settings.get().ratingSystem },
			(value) => { this.rating = value; },
		);
	}

	private renderProgress(form: HTMLElement): void {
		if (!this.isBook) {
			this.counterPair(form, ['chaptersRead', 'add.reading.chaptersRead'], ['volumesRead', 'add.reading.volumesRead']);
			this.counterPair(form, ['totalChapters', 'add.reading.totalChapters'], ['totalVolumes', 'add.reading.totalVolumes']);
			return;
		}
		// Pages/Words switch: swaps which counter pair is collected; the other unit's numbers stay, so flipping back is lossless
		renderSegmentedToggle<BookProgressUnit>({
			parent: makeRow(form, t('add.reading.progress')),
			options: [
				{ value: 'pages', label: t('add.reading.pages'), title: t('add.reading.pagesTip') },
				{ value: 'words', label: t('add.reading.words'), title: t('add.reading.wordsTip') },
			],
			value: this.progressUnit,
			onPick: (unit) => { this.progressUnit = unit; this.render(); },
		});
		const words = this.progressUnit === 'words';
		this.counterPair(form,
			words ? ['wordsRead', 'add.reading.wordsRead'] : ['pagesRead', 'add.reading.pagesRead'],
			['chaptersRead', 'add.reading.chaptersRead']);
		this.counterPair(form,
			words ? ['totalWords', 'add.reading.totalWords'] : ['totalPages', 'add.reading.totalPages'],
			['totalChapters', 'add.reading.totalChapters']);
	}

	private counterPair(form: HTMLElement, left: CounterSpec, right: CounterSpec): void {
		const row = form.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		this.counterInput(makeCell(row, t(left[1])), left[0]);
		this.counterInput(makeCell(row, t(right[1]), true), right[0]);
	}

	private counterInput(cell: HTMLElement, field: CounterField): void {
		numberInput(cell, { value: this.counters[field], min: 0, onInput: (v) => { this.counters[field] = Math.max(0, v); } });
	}

	private async save(): Promise<void> {
		const name = this.title.trim();
		if (!name) {
			new Notice(t('add.reading.emptyTitle'));
			return;
		}
		const existing = this.isBook ? this.reading.getBooks() : this.reading.getMangaList();
		const blocked = blockDuplicate(this.host, this.duplicates, {
			name,
			isDuplicate: existing.some((entry) => entry.title.toLowerCase() === name.toLowerCase()),
			verb: 'Add',
			retry: () => void this.save(),
		});
		if (blocked) return;

		const id = this.isBook ? await this.addBook(name) : await this.addManga(name);
		new Notice(t('add.added', { name }));
		this.ctx.done({ kind: this.ctx.kind, id });
	}

	private common() {
		return {
			author: this.author.trim(),
			status: this.status,
			rating: this.rating,
			chaptersRead: this.counters.chaptersRead,
			totalChapters: this.counters.totalChapters,
			coverUrl: this.coverUrl.trim(),
			vaultPage: '',
			dateStarted: this.dateStarted,
			dateFinished: null,
			releaseDate: this.releaseDate,
		};
	}

	private async addBook(title: string): Promise<string> {
		const book = newBook({
			id: this.reading.generateBookId(title),
			title,
			...this.common(),
			progressUnit: this.progressUnit,
			pagesRead: this.counters.pagesRead,
			totalPages: this.counters.totalPages,
			wordsRead: this.counters.wordsRead,
			totalWords: this.counters.totalWords,
			googleBooksId: this.googleBooksId.trim(),
			openLibraryId: this.openLibraryId.trim(),
		});
		await this.reading.addBook(book);
		return book.id;
	}

	private async addManga(title: string): Promise<string> {
		const manga = newManga({
			id: this.reading.generateMangaId(title),
			title,
			...this.common(),
			volumesRead: this.counters.volumesRead,
			totalVolumes: this.counters.totalVolumes,
			malId: this.malId.trim(),
		});
		await this.reading.addManga(manga);
		return manga.id;
	}
}

/**
 * Mounts the form that saves a book or manga into `host`. `row` is the picked search row;
 * null is a manual entry with the typed query as its title.
 */
export function mountReadingAddForm(
	host: HTMLElement,
	settings: SettingsReader,
	reading: AddReadingStore,
	api: AddReadingApi,
	ctx: AddFormContext,
	row: ReadingRow | null,
): AddFormHandle {
	const form = new ReadingAddForm(host, settings, reading, api, ctx, row);
	form.start();
	return form;
}
