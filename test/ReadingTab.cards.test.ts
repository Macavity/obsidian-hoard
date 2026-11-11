import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { ReadingTab } from '../src/ReadingTab';
import { t } from '../src/i18n';
import type { Book, Manga, ReadingCustomColumn } from '../src/types';

vi.mock('../src/PosterCard', () => ({
	openCardMenu: vi.fn(),
	buildPosterCard: vi.fn(),
	POSTER_CARD_TEXT_H: 40,
}));
import { openCardMenu } from '../src/PosterCard';

const shown = (Notice as unknown as { shown: string[] }).shown;

const book = (over: Partial<Book> = {}): Book => ({
	id: 'b1', title: 'Dune', author: 'Herbert', status: 'Reading', rating: 0, progressUnit: 'pages',
	pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0,
	coverUrl: '', googleBooksId: '', vaultPage: '', dateStarted: null, dateFinished: null, releaseDate: null,
	dateAdded: '', dateModified: '', customFields: {}, ...over,
} as unknown as Book);

const manga = (over: Partial<Manga> = {}): Manga => ({
	id: 'm1', title: 'Berserk', author: 'Miura', status: 'Reading', rating: 0, chaptersRead: 0, totalChapters: 0,
	volumesRead: 0, totalVolumes: 0, coverUrl: '', malId: '', vaultPage: '', dateStarted: null, dateFinished: null,
	releaseDate: null, dateAdded: '', dateModified: '', customFields: {}, ...over,
} as unknown as Manga);

interface Opts {
	columns?: ReadingCustomColumn[];
	textUnder?: boolean;
	hasKey?: boolean;
	cover?: string;
	coverFails?: boolean;
	fresh?: boolean;
}

function build(sub: 'books' | 'manga', o: Opts = {}) {
	const readingData = {
		onChange: () => {}, offChange: () => {},
		getSettings: () => ({ defaultSubTab: sub, statusColors: {} }),
		getBookColumns: () => o.columns ?? [],
		getMangaColumns: () => o.columns ?? [],
		getBook: vi.fn((id: string) => (o.fresh === false ? undefined : book({ id }))),
		getManga: vi.fn((id: string) => (o.fresh === false ? undefined : manga({ id }))),
		updateBook: vi.fn(() => Promise.resolve()),
		updateManga: vi.fn(() => Promise.resolve()),
	};
	const apiService = {
		hasGoogleBooksKey: () => o.hasKey ?? true,
		getGoogleBookById: vi.fn(() => (o.coverFails ? Promise.reject(new Error('x')) : Promise.resolve({ coverUrl: o.cover ?? '' }))),
		getMangaByMalId: vi.fn(() => (o.coverFails ? Promise.reject(new Error('x')) : Promise.resolve({ coverUrl: o.cover ?? '' }))),
	};
	const plugin = { app: {}, apiService, isCardTextUnder: () => o.textUnder ?? true, settings: {} };
	const container = document.createElement('div');
	const tab = new ReadingTab(container, plugin as never, readingData as never);
	(tab as unknown as { activeSubTab: string }).activeSubTab = sub;
	const x = tab as unknown as {
		renderBookCard: (g: HTMLElement, b: Book) => void;
		renderMangaCard: (g: HTMLElement, m: Manga) => void;
		refreshCover: (i: Book | Manga) => void;
		renderByStatusSection: (p: HTMLElement, items: Array<Book | Manga>, v: (i: Book | Manga) => boolean, f: boolean, isBooks: boolean) => void;
		applyFilters: (items: Array<Book | Manga>) => Array<Book | Manga>;
		filters: { statusExclude: string[]; ratingMode: string; customExclude: Record<string, string[]> };
		selectionMode: boolean;
		selectedIds: Set<string>;
		render: () => void;
	};
	return { tab: x, readingData, apiService, container };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => { shown.length = 0; });
afterEach(() => {
	const filters = (ReadingTab as unknown as { sessionFilters: Record<string, unknown> }).sessionFilters;
	filters.books = { statusExclude: [], ratingMode: 'all', customExclude: {} };
	filters.manga = { statusExclude: [], ratingMode: 'all', customExclude: {} };
	(ReadingTab as unknown as { sessionSubTab: null }).sessionSubTab = null;
	vi.clearAllMocks();
});

describe('ReadingTab book card', () => {
	const progressText = (g: HTMLElement) => g.querySelector('.hoard-reading-card__progress-text')!.textContent;

	it('shows read / total with the pages unit', () => {
		const { tab } = build('books');
		const grid = document.createElement('div');
		tab.renderBookCard(grid, book({ pagesRead: 50, totalPages: 200 }));
		expect(progressText(grid)).toContain('50');
		expect(progressText(grid)).toContain('200');
		expect(progressText(grid)).toContain(t('reading.card.units.pages'));
		expect((grid.querySelector('.hoard-reading-card__progress-fill') as HTMLElement).style.width).toBe('25%');
	});

	it('uses the words unit for a words-mode book', () => {
		const { tab } = build('books');
		const grid = document.createElement('div');
		tab.renderBookCard(grid, book({ progressUnit: 'words', wordsRead: 10, totalWords: 100 }));
		expect(progressText(grid)).toContain(t('reading.card.units.words'));
	});

	it('shows only the read count when the total is unknown', () => {
		const { tab } = build('books');
		const grid = document.createElement('div');
		tab.renderBookCard(grid, book({ pagesRead: 30 }));
		expect(progressText(grid)).toContain('30');
		expect(progressText(grid)).not.toContain('/');
	});

	it('shows the no-progress text for an untouched book and opens no selection state', () => {
		const { tab } = build('books');
		const grid = document.createElement('div');
		tab.renderBookCard(grid, book());
		expect(progressText(grid)).toBe(t('reading.card.noProgress'));
		expect(grid.querySelector('.hoard-reading-card__cover-icon')!.textContent).toBe('📖');
		expect(grid.querySelector('.hoard-reading-card')!.classList.contains('is-selected')).toBe(false);
	});

	it('toggles selection on click in selection mode', () => {
		const { tab } = build('books');
		tab.selectionMode = true;
		tab.selectedIds.add('b1');
		tab.render = vi.fn();
		const grid = document.createElement('div');
		tab.renderBookCard(grid, book());
		const card = grid.querySelector('.hoard-reading-card') as HTMLElement;
		expect(card.classList.contains('is-selected')).toBe(true);
		card.click();
		expect(tab.selectedIds.has('b1')).toBe(false);
		expect(card.classList.contains('is-selected')).toBe(false);
		card.click();
		expect(tab.selectedIds.has('b1')).toBe(true);
		expect(tab.render).toHaveBeenCalledTimes(2);
	});
});

describe('ReadingTab manga card', () => {
	const pieces = (g: HTMLElement) => Array.from(g.querySelectorAll('.hoard-reading-card__progress-piece')).map((e) => e.textContent);

	it('shows chapters and volumes pieces with totals', () => {
		const { tab } = build('manga');
		const grid = document.createElement('div');
		tab.renderMangaCard(grid, manga({ chaptersRead: 5, totalChapters: 10, volumesRead: 1, totalVolumes: 4 }));
		expect(pieces(grid)).toEqual([
			t('reading.card.chapters', { read: 5, total: 10 }),
			t('reading.card.volumes', { read: 1, total: 4 }),
		]);
		expect((grid.querySelector('.hoard-reading-card__progress-fill') as HTMLElement).style.width).toBe('50%');
	});

	it('shows the read-only pieces when totals are unknown', () => {
		const { tab } = build('manga');
		const grid = document.createElement('div');
		tab.renderMangaCard(grid, manga({ chaptersRead: 5, volumesRead: 2 }));
		expect(pieces(grid)).toEqual([
			t('reading.card.chaptersRead', { read: 5 }),
			t('reading.card.volumesRead', { read: 2 }),
		]);
	});

	it('shows the no-progress text for an untouched manga', () => {
		const { tab } = build('manga');
		const grid = document.createElement('div');
		tab.renderMangaCard(grid, manga());
		expect(pieces(grid)).toEqual([]);
		expect(grid.querySelector('.hoard-reading-card__progress-text')!.textContent).toBe(t('reading.card.noProgress'));
	});

	it('renders a cover image for a manga with a cover and overlay text when text is inside', () => {
		const { tab } = build('manga', { textUnder: false });
		const grid = document.createElement('div');
		tab.renderMangaCard(grid, manga({ coverUrl: 'http://c/1.jpg', author: '' }));
		expect(grid.querySelector('.hoard-reading-card__cover-img')!.getAttribute('src')).toBe('http://c/1.jpg');
		expect(grid.querySelector('.hoard-reading-card')!.classList.contains('is-text-inside')).toBe(true);
		expect(grid.querySelector('.hoard-reading-card__overlay')).not.toBeNull();
		expect(grid.querySelector('.hoard-reading-card__author')!.textContent).toBe('—');
		const style = (sel: string, name: string): string => grid.querySelector<HTMLElement>(sel)!.style.getPropertyValue(name);
		expect(style('.hoard-reading-card__status-badge', '--hoard-reading-card-status-color')).not.toBe('');
		// a real cover needs no fallback colour
		expect(style('.hoard-reading-card__cover', '--hoard-reading-card-cover-color')).toBe('');
	});

	it('paints the fallback colour on a cover-less card', () => {
		const { tab } = build('manga', { textUnder: false });
		const grid = document.createElement('div');
		tab.renderMangaCard(grid, manga());
		expect(grid.querySelector<HTMLElement>('.hoard-reading-card__cover')!.style.getPropertyValue('--hoard-reading-card-cover-color')).not.toBe('');
	});
});

describe('ReadingTab.refreshCover', () => {
	it('warns about a missing Google Books id', () => {
		const { tab } = build('books');
		tab.refreshCover(book());
		expect(shown).toEqual(['No Google Books or Open Library ID; cannot refresh cover.']);
	});

	it('warns about a missing Google Books key', () => {
		const { tab } = build('books', { hasKey: false });
		tab.refreshCover(book({ googleBooksId: 'g1' }));
		expect(shown).toEqual([t('reading.notices.googleBooksKeyRequired')]);
	});

	it('refreshes an Open Library book without a Google key', async () => {
		const { tab, readingData } = build('books', { hasKey: false, cover: 'http://c/ol.jpg' });
		const api = (tab as unknown as { plugin: { apiService: Record<string, unknown> } }).plugin.apiService;
		api.getOpenLibraryWork = vi.fn(() => Promise.resolve({ coverUrl: 'http://c/ol.jpg' }));
		tab.refreshCover(book({ openLibraryId: 'OL1W' }));
		await flush();
		expect(shown).toEqual([t('reading.notices.coverRefreshed')]);
		expect(readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: 'http://c/ol.jpg' }));
	});

	it('stores a fetched book cover', async () => {
		const { tab, readingData } = build('books', { cover: 'http://c/new.jpg' });
		tab.refreshCover(book({ googleBooksId: 'g1' }));
		await flush();
		expect(readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: 'http://c/new.jpg' }));
		expect(shown).toEqual([t('reading.notices.coverRefreshed')]);
	});

	it('reports an empty book cover result', async () => {
		const { tab, readingData } = build('books', { cover: '' });
		tab.refreshCover(book({ googleBooksId: 'g1' }));
		await flush();
		expect(readingData.updateBook).not.toHaveBeenCalled();
		expect(shown).toEqual([t('reading.notices.coverFetchFailed')]);
	});

	it('does nothing when the book vanished meanwhile', async () => {
		const { tab, readingData } = build('books', { cover: 'http://c/x.jpg', fresh: false });
		tab.refreshCover(book({ googleBooksId: 'g1' }));
		await flush();
		expect(readingData.updateBook).not.toHaveBeenCalled();
		expect(shown).toEqual([]);
	});

	it('reports a failing book cover request with the API message', async () => {
		const { tab } = build('books', { coverFails: true });
		tab.refreshCover(book({ googleBooksId: 'g1' }));
		await flush();
		expect(shown).toEqual([t('notices.api.requestFailed')]);
	});

	it('warns about a missing MAL id', () => {
		const { tab } = build('manga');
		tab.refreshCover(manga());
		expect(shown).toEqual([t('reading.notices.noMalId')]);
	});

	it('stores a fetched manga cover', async () => {
		const { tab, readingData } = build('manga', { cover: 'http://c/m.jpg' });
		tab.refreshCover(manga({ malId: '2' }));
		await flush();
		expect(readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: 'http://c/m.jpg' }));
		expect(shown).toEqual([t('reading.notices.coverRefreshed')]);
	});

	it('reports empty, vanished and failing manga covers', async () => {
		const empty = build('manga', { cover: '' });
		empty.tab.refreshCover(manga({ malId: '2' }));
		await flush();
		expect(shown).toEqual([t('reading.notices.coverFetchFailed')]);
		shown.length = 0;
		const gone = build('manga', { cover: 'http://c/m.jpg', fresh: false });
		gone.tab.refreshCover(manga({ malId: '2' }));
		await flush();
		expect(gone.readingData.updateManga).not.toHaveBeenCalled();
		expect(shown).toEqual([]);
		const failing = build('manga', { coverFails: true });
		failing.tab.refreshCover(manga({ malId: '2' }));
		await flush();
		expect(shown).toEqual([t('reading.notices.refreshFailed')]);
	});

	it('hands the refresh action to the card menu', () => {
		const { tab, container } = build('books');
		const grid = document.createElement('div');
		container.appendChild(grid);
		tab.renderBookCard(grid, book());
		(grid.querySelector('.hoard-reading-card__menu-btn') as HTMLElement).click();
		const items = vi.mocked(openCardMenu).mock.calls[0]![2];
		expect(items.map((i) => i.label)).toEqual([t('reading.card.refreshCover')]);
	});
});

describe('ReadingTab.applyFilters', () => {
	const select: ReadingCustomColumn = { id: 'c1', name: 'Series', type: 'select', options: ['A', 'B'] };
	const text: ReadingCustomColumn = { id: 'c2', name: 'Note', type: 'text' } as ReadingCustomColumn;

	it('returns everything with default filters', () => {
		const { tab } = build('books', { columns: [select] });
		expect(tab.applyFilters([book({ id: 'a' }), book({ id: 'b' })])).toHaveLength(2);
	});

	it('drops excluded statuses and filters by rating mode', () => {
		const { tab } = build('books');
		const items = [book({ id: 'a', status: 'Completed', rating: 3 }), book({ id: 'b', rating: 4 }), book({ id: 'c', rating: 0 })];
		tab.filters.statusExclude = ['Completed'];
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['b', 'c']);
		tab.filters.statusExclude = [];
		tab.filters.ratingMode = 'has';
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['a', 'b']);
		tab.filters.ratingMode = 'none';
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['c']);
	});

	it('hides items whose select value is excluded but keeps items without a value', () => {
		const { tab } = build('books', { columns: [select] });
		tab.filters.customExclude = { c1: ['A'] };
		const items = [
			book({ id: 'a', customFields: { c1: 'A' } }),
			book({ id: 'b', customFields: { c1: 'B' } }),
			book({ id: 'c', customFields: {} }),
			book({ id: 'd', customFields: { c1: null as unknown as string } }),
		];
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['b', 'c', 'd']);
	});

	it('filters text columns on has value / no value', () => {
		const { tab } = build('books', { columns: [text] });
		const items = [book({ id: 'a', customFields: { c2: 'x' } }), book({ id: 'b', customFields: { c2: '' } })];
		tab.filters.customExclude = { c2: ['__has__'] };
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['b']);
		tab.filters.customExclude = { c2: ['__none__'] };
		expect(tab.applyFilters(items).map((i) => i.id)).toEqual(['a']);
	});
});

describe('ReadingTab.renderByStatusSection', () => {
	const all = () => true;

	it('renders one grid per non-empty status in status order', () => {
		const { tab } = build('books');
		const parent = document.createElement('div');
		tab.renderByStatusSection(parent, [book({ id: 'a', status: 'Completed' }), book({ id: 'b', status: 'Reading' })], all, false, true);
		expect(parent.querySelector('.hoard-rows-view__grouped-title')!.textContent).toBe(t('reading.shelves.byStatus'));
		expect(parent.querySelectorAll('.hoard-rows-view__shelf-title')).toHaveLength(2);
		expect(parent.querySelectorAll('.hoard-rows-view__grouped-spacer')).toHaveLength(2);
	});

	it('adds a select-all box per bucket in selection mode', () => {
		const { tab } = build('manga');
		tab.selectionMode = true;
		const parent = document.createElement('div');
		tab.renderByStatusSection(parent, [manga({ id: 'a' })], all, false, false);
		expect(parent.querySelector('.hoard-rows-view__shelf-select')).not.toBeNull();
	});

	it('shows the empty hint when nothing is there and no filter is active', () => {
		const { tab } = build('books');
		const parent = document.createElement('div');
		tab.renderByStatusSection(parent, [], all, false, true);
		expect(parent.textContent).toContain(t('reading.shelves.emptyByStatus'));
	});

	it('removes the section when filtering leaves it empty', () => {
		const { tab } = build('books');
		const parent = document.createElement('div');
		tab.renderByStatusSection(parent, [book()], () => false, true, true);
		expect(parent.querySelector('.hoard-rows-view__grouped')).toBeNull();
	});
});
