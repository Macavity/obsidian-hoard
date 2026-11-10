import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingTab } from '../src/ReadingTab';
import { READING_STATUSES, type Book, type Manga } from '../src/types';

vi.mock('../src/ConfirmModal', () => ({ ConfirmModal: class { constructor(_a: unknown, _m: string, public onConfirm: () => void) {} open(): void { this.onConfirm(); } } }));
vi.mock('../src/ReadingManageColumnsModal', () => ({ ReadingManageColumnsModal: class { open(): void {} } }));

interface Api {
	getGoogleBookById: ReturnType<typeof vi.fn>;
	searchGoogleBooks: ReturnType<typeof vi.fn>;
	searchOpenLibrary: ReturnType<typeof vi.fn>;
	getOpenLibraryWork: ReturnType<typeof vi.fn>;
	hasGoogleBooksKey: ReturnType<typeof vi.fn>;
	getMangaByMalId: ReturnType<typeof vi.fn>;
	searchManga: ReturnType<typeof vi.fn>;
}

type Priv = {
	activeSubTab: 'books' | 'manga';
	selectedIds: Set<string>;
	selectionMode: boolean;
	savedFilterActive: boolean;
	coverFetchFailed: Set<string>;
	filters: { statusExclude: string[]; ratingMode: string; customExclude: Record<string, string[]> };
	render: () => void;
	renderContent: () => void;
	renderReadingActions: (p: HTMLElement) => void;
	renderSelectionActionBar: (p: HTMLElement) => void;
	filtersMatchSaved: (s: { statusInclude: string[]; ratingMode: string }) => boolean;
	resolveCover: (k: 'book' | 'manga', i: Book | Manga) => Promise<{ url: string; sourceId: string }>;
	handleCoversVisible: (cards: HTMLElement[]) => void;
	toggleFilterPopover: () => void;
	toggleSortPopover: () => void;
};

function build(sub: 'books' | 'manga', savedFilters?: unknown) {
	const items: Record<string, Book | Manga> = {};
	const readingData = {
		onChange: () => {}, offChange: () => {},
		getSettings: () => ({ defaultSubTab: sub, statusColors: {}, savedFilters }),
		getBookColumns: () => [], getMangaColumns: () => [],
		getBook: (id: string) => items[id],
		getManga: (id: string) => items[id],
		getBooks: () => Object.values(items), getMangaList: () => Object.values(items),
		updateCoverAndSource: vi.fn(() => Promise.resolve()),
		updateCoverUrl: vi.fn(() => Promise.resolve()),
		removeBooksBatch: vi.fn(() => Promise.resolve()),
		removeMangaBatch: vi.fn(() => Promise.resolve()),
	};
	const apiService: Api = {
		getGoogleBookById: vi.fn(),
		searchGoogleBooks: vi.fn(),
		searchOpenLibrary: vi.fn(),
		getOpenLibraryWork: vi.fn(),
		hasGoogleBooksKey: vi.fn(() => true),
		getMangaByMalId: vi.fn(),
		searchManga: vi.fn(),
	};
	const plugin = { app: {}, apiService, isCardTextUnder: () => true, settings: { booksApiSource: 'google' } };
	const tab = new ReadingTab(document.createElement('div'), plugin as never, readingData as never);
	const p = tab as unknown as Priv;
	p.activeSubTab = sub;
	return { p, items, readingData, apiService };
}

afterEach(() => {
	const filters = (ReadingTab as unknown as { sessionFilters: Record<string, unknown> }).sessionFilters;
	filters.books = { statusExclude: [], ratingMode: 'all', customExclude: {} };
	filters.manga = { statusExclude: [], ratingMode: 'all', customExclude: {} };
	(ReadingTab as unknown as { sessionSubTab: null }).sessionSubTab = null;
});

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const bk = (over: Partial<Book> = {}) => ({ id: 'b1', title: 'Dune', author: 'Herbert', coverUrl: '', googleBooksId: '', ...over }) as unknown as Book;
const mg = (over: Partial<Manga> = {}) => ({ id: 'm1', title: 'Berserk', coverUrl: '', malId: '', ...over }) as unknown as Manga;

describe('ReadingTab.resolveCover', () => {
	it('uses the Google Books id when there is one', async () => {
		const { p, apiService } = build('books');
		apiService.getGoogleBookById.mockResolvedValue({ coverUrl: 'c' });
		expect(await p.resolveCover('book', bk({ googleBooksId: 'g' }))).toEqual({ url: 'c', sourceId: '' });
		apiService.getGoogleBookById.mockResolvedValue(null);
		expect(await p.resolveCover('book', bk({ googleBooksId: 'g' }))).toEqual({ url: '', sourceId: '' });
	});

	it('searches by title and author without an id and returns the new id', async () => {
		const { p, apiService } = build('books');
		apiService.searchGoogleBooks.mockResolvedValue([{ coverUrl: 'c', googleBooksId: 'gid' }]);
		expect(await p.resolveCover('book', bk())).toEqual({ url: 'c', sourceId: 'gid' });
		expect(apiService.searchGoogleBooks).toHaveBeenCalledWith('Dune Herbert');
		await p.resolveCover('book', bk({ author: '' }));
		expect(apiService.searchGoogleBooks).toHaveBeenLastCalledWith('Dune');
		apiService.searchGoogleBooks.mockResolvedValue([]);
		expect(await p.resolveCover('book', bk())).toEqual({ url: '', sourceId: '' });
		apiService.searchGoogleBooks.mockResolvedValue([{ coverUrl: '', googleBooksId: 'x' }]);
		expect(await p.resolveCover('book', bk())).toEqual({ url: '', sourceId: '' });
	});

	it('searches Open Library without a Google key', async () => {
		const { p, apiService } = build('books');
		apiService.hasGoogleBooksKey.mockReturnValue(false);
		apiService.searchOpenLibrary.mockResolvedValue([{ coverUrl: 'oc', googleBooksId: '', openLibraryId: 'OL1W' }]);
		expect(await p.resolveCover('book', bk())).toEqual({ url: 'oc', sourceId: 'OL1W' });
		expect(apiService.searchOpenLibrary).toHaveBeenCalledWith('Dune Herbert');
		expect(apiService.searchGoogleBooks).not.toHaveBeenCalled();
	});

	it('uses the Open Library id when there is one', async () => {
		const { p, apiService } = build('books');
		apiService.getOpenLibraryWork.mockResolvedValue({ coverUrl: 'oc' });
		expect(await p.resolveCover('book', { ...bk(), openLibraryId: 'OL1W' })).toEqual({ url: 'oc', sourceId: '' });
	});

	it('resolves manga by MAL id or title search', async () => {
		const { p, apiService } = build('manga');
		apiService.getMangaByMalId.mockResolvedValue({ coverUrl: 'mc' });
		expect(await p.resolveCover('manga', mg({ malId: '7' }))).toEqual({ url: 'mc', sourceId: '' });
		expect(apiService.getMangaByMalId).toHaveBeenCalledWith(7);
		apiService.searchManga.mockResolvedValue([{ coverUrl: 'sc', malId: 99 }]);
		expect(await p.resolveCover('manga', mg())).toEqual({ url: 'sc', sourceId: '99' });
		apiService.searchManga.mockResolvedValue([{ coverUrl: '', malId: 0 }]);
		expect(await p.resolveCover('manga', mg())).toEqual({ url: '', sourceId: '' });
	});

	it('swallows lookup errors', async () => {
		const { p, apiService } = build('books');
		apiService.searchGoogleBooks.mockRejectedValue(new Error('offline'));
		expect(await p.resolveCover('book', bk())).toEqual({ url: '', sourceId: '' });
	});
});

describe('ReadingTab.handleCoversVisible', () => {
	const card = (id?: string): HTMLElement => {
		const c = document.createElement('div');
		if (id) c.dataset.itemId = id;
		const cover = document.createElement('div');
		cover.className = 'hoard-reading-card-cover';
		c.append(cover);
		return c;
	};

	it('persists a resolved cover with its new source id and marks failures', async () => {
		const { p, items, apiService, readingData } = build('books');
		items.b1 = bk({ id: 'b1' });
		items.b2 = bk({ id: 'b2', coverUrl: 'has' });
		items.b3 = bk({ id: 'b3', googleBooksId: 'g3' });
		items.b4 = bk({ id: 'b4', googleBooksId: 'g4' });
		apiService.searchGoogleBooks.mockResolvedValue([{ coverUrl: 'new', googleBooksId: 'gid' }]);
		apiService.getGoogleBookById.mockResolvedValueOnce({ coverUrl: 'direct' }).mockResolvedValueOnce({ coverUrl: '' });
		p.coverFetchFailed.add('b4x');
		const c1 = card('b1');
		p.handleCoversVisible([card(), card('missing'), card('b2'), c1, card('b3'), card('b4')]);
		expect(c1.querySelector('.hoard-reading-card-cover')!.classList.contains('is-loading')).toBe(true);
		await flush();
		expect(readingData.updateCoverAndSource).toHaveBeenCalledWith('book', 'b1', 'new', 'gid');
		expect(readingData.updateCoverUrl).toHaveBeenCalledWith('book', 'b3', 'direct');
		expect(p.coverFetchFailed.has('b4')).toBe(true);
		expect(c1.querySelector('.hoard-reading-card-cover')!.classList.contains('is-loading')).toBe(false);
		expect(c1.querySelector('img')).not.toBeNull();
		p.handleCoversVisible([card('b4')]);
		expect(apiService.getGoogleBookById).toHaveBeenCalledTimes(2);
	});

	it('uses the manga lookup on the manga sub-tab', async () => {
		const { p, items, apiService, readingData } = build('manga');
		items.m1 = mg();
		apiService.searchManga.mockResolvedValue([{ coverUrl: 'sc', malId: 5 }]);
		p.handleCoversVisible([card('m1')]);
		await flush();
		expect(readingData.updateCoverAndSource).toHaveBeenCalledWith('manga', 'm1', 'sc', '5');
	});
});

describe('ReadingTab.filtersMatchSaved', () => {
	it('matches only when status, rating and custom filters agree', () => {
		const { p } = build('books');
		const everything = { statusInclude: [...READING_STATUSES], ratingMode: 'all' };
		expect(p.filtersMatchSaved(everything)).toBe(true);
		expect(p.filtersMatchSaved({ ...everything, ratingMode: 'has' })).toBe(false);
		expect(p.filtersMatchSaved({ statusInclude: [], ratingMode: 'all' })).toBe(false);
		p.filters.statusExclude = ['__other__'];
		expect(p.filtersMatchSaved(everything)).toBe(false);
		p.filters.statusExclude = [];
		p.filters.customExclude = { c1: ['x'] };
		expect(p.filtersMatchSaved(everything)).toBe(false);
	});
});

describe('ReadingTab.renderReadingActions', () => {
	it('wires saved filter, filter, reset, sort and manage buttons', () => {
		const saved = { books: { statusInclude: ['Reading'], ratingMode: 'has' } };
		const { p } = build('books', saved);
		const render = vi.spyOn(p, 'render').mockImplementation(() => {});
		const renderContent = vi.spyOn(p, 'renderContent').mockImplementation(() => {});
		const parent = document.createElement('div');
		p.renderReadingActions(parent);
		const btns = Array.from(parent.querySelectorAll('button'));
		const savedBtn = btns[0]!;
		savedBtn.click();
		expect(p.savedFilterActive).toBe(true);
		expect(savedBtn.classList.contains('hoard-btn-preset-active')).toBe(true);
		expect(render).toHaveBeenCalled();
		parent.querySelector<HTMLElement>('.hoard-reading-reset-btn')!.click();
		expect(p.savedFilterActive).toBe(false);
		expect(renderContent).toHaveBeenCalled();
		const manage = parent.querySelector<HTMLButtonElement>('button.hoard-reading-manage-btn')!;
		expect(manage.classList.contains('hoard-icon-btn')).toBe(true);
		expect(manage.getAttribute('data-icon')).toBe('settings');
		manage.click();
		vi.spyOn(p, 'toggleFilterPopover').mockImplementation(() => {});
		vi.spyOn(p, 'toggleSortPopover').mockImplementation(() => {});
		parent.querySelector<HTMLElement>('.hoard-reading-filter-btn')!.click();
		parent.querySelector<HTMLElement>('.hoard-reading-sort-btn')!.click();
	});

	it('has no saved-filter button without a stored filter and shows the delete bar in selection mode', async () => {
		const { p, items, readingData } = build('books');
		vi.spyOn(p, 'render').mockImplementation(() => {});
		items.b1 = bk();
		p.selectionMode = true;
		p.selectedIds.add('b1');
		const parent = document.createElement('div');
		p.renderReadingActions(parent);
		expect(parent.querySelector('.hoard-btn-preset-active')).toBeNull();
		const del = parent.querySelector<HTMLButtonElement>('button.hoard-group-action-btn-delete')!;
		expect(del.getAttribute('data-icon')).toBe('x');
		del.click();
		await flush();
		expect(readingData.removeBooksBatch).toHaveBeenCalledWith(['b1']);
		expect(p.selectionMode).toBe(false);
	});
});
