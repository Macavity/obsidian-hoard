import { describe, expect, it, vi } from 'vitest';
import { AddReadingModal, type ReadingMode } from '../src/AddReadingModal';
import { t } from '../src/i18n';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

interface ApiOver {
	hasKey?: boolean;
	books?: unknown[];
	manga?: unknown[];
	single?: unknown;
	fail?: Error;
	bookDetail?: unknown;
	mangaDetail?: unknown;
}

function setup(mode: ReadingMode, over: ApiOver = {}, opts: { prefill?: string; initialState?: boolean } = {}) {
	const api = {
		hasGoogleBooksKey: vi.fn(() => over.hasKey ?? true),
		searchGoogleBooks: vi.fn(() => (over.fail ? Promise.reject(over.fail) : Promise.resolve(over.books ?? []))),
		searchManga: vi.fn(() => (over.fail ? Promise.reject(over.fail) : Promise.resolve(over.manga ?? []))),
		getMangaByMalId: vi.fn((id: number) => Promise.resolve(over.single !== undefined ? over.single : (id === 7 ? over.mangaDetail : null))),
		getGoogleBookById: vi.fn(() => Promise.resolve(over.bookDetail ?? null)),
	};
	const plugin = {
		settings: {},
		apiService: api,
		readingDataManager: {
			getBooks: () => [{ title: 'Dune', googleBooksId: 'g-owned' }],
			getMangaList: () => [{ title: 'Berserk', malId: '2' }],
		},
	};
	const readingData = { getSettings: () => ({}) };
	const initial = opts.initialState
		? { id: 'x', state: { vaultPage: 'a.md' } as never }
		: undefined;
	const modal = new AddReadingModal({} as never, plugin as never, readingData as never, mode, () => {}, initial, opts.prefill);
	modal.open();
	const results = () => modal.contentEl.querySelector('.hoard-modal-results') as HTMLElement;
	const state = () => (modal as unknown as { state: Record<string, unknown> }).state;
	return { modal, api, results, state };
}

const book = { title: 'Dune', author: 'Herbert', year: 1965, coverUrl: 'http://c/1.jpg', googleBooksId: 'g-owned', totalPages: 100, releaseDate: '1965-01-01' };
const manga = { title: 'Berserk', author: 'Miura', year: 1989, coverUrl: '', malId: 2, totalChapters: 0, totalVolumes: 0, releaseDate: undefined };

describe('AddReadingModal lookup', () => {
	it('shows the missing key hint for books without a Google Books key', async () => {
		const { api, results } = setup('book', { hasKey: false }, { prefill: 'dune' });
		await flush();
		expect(api.searchGoogleBooks).not.toHaveBeenCalled();
		expect(results().textContent).toBe(t('add.reading.needGoogleKey'));
	});

	it('renders book results, marks owned ones and applies a pick including the detail upgrade', async () => {
		const { api, results, state } = setup('book', { books: [book], bookDetail: { totalPages: 412, coverUrl: 'http://c/2.jpg' } }, { prefill: 'dune' });
		await flush();
		expect(api.searchGoogleBooks).toHaveBeenCalledWith('dune');
		const cards = results().querySelectorAll('.hoard-result-card');
		expect(cards).toHaveLength(1);
		expect(cards[0]!.classList.contains('is-in-library')).toBe(true);
		expect(cards[0]!.textContent).toContain('Herbert · 1965');
		(cards[0] as HTMLElement).click();
		expect(state().title).toBe('Dune');
		expect(state().googleBooksId).toBe('g-owned');
		await flush();
		expect(state().totalPages).toBe(412);
		expect(state().coverUrl).toBe('http://c/2.jpg');
	});

	it('falls back to placeholder labels for untitled results without author or year', async () => {
		const { results } = setup('book', { books: [{ ...book, title: '', author: '', year: 0, googleBooksId: '' }] }, { prefill: 'x' });
		await flush();
		const card = results().querySelector('.hoard-result-card') as HTMLElement;
		expect(card.textContent).toContain(t('add.reading.untitled'));
		expect(card.textContent).toContain(t('add.reading.unknownAuthor'));
		expect(card.classList.contains('is-in-library')).toBe(false);
	});

	it('shows the no-matches message for an empty result list', async () => {
		const { results } = setup('book', { books: [] }, { prefill: 'zzz' });
		await flush();
		expect(results().textContent).toBe(t('add.noMatches'));
	});

	it('searches manga by title and enriches the picked result from its MAL id', async () => {
		const { api, results, state } = setup('manga', { manga: [{ ...manga, malId: 7 }], mangaDetail: { totalChapters: 364, totalVolumes: 41 } }, { prefill: 'berserk' });
		await flush();
		expect(api.searchManga).toHaveBeenCalledWith('berserk');
		const card = results().querySelector('.hoard-result-card') as HTMLElement;
		expect(card.textContent).toContain('Miura · 1989');
		card.click();
		expect(state().malId).toBe('7');
		await flush();
		expect(state().totalChapters).toBe(364);
		expect(state().totalVolumes).toBe(41);
	});

	it('looks a numeric manga query up by MAL id', async () => {
		const { api, results } = setup('manga', { single: manga }, { prefill: '2' });
		await flush();
		expect(api.getMangaByMalId).toHaveBeenCalledWith(2);
		expect(api.searchManga).not.toHaveBeenCalled();
		expect(results().querySelectorAll('.hoard-result-card')).toHaveLength(1);
	});

	it('shows no matches when the MAL id does not exist', async () => {
		const { results } = setup('manga', { single: null }, { prefill: '99' });
		await flush();
		expect(results().textContent).toBe(t('add.noMatches'));
	});

	it('keeps the picked manga values when the detail lookup reports zero totals', async () => {
		const { results, state } = setup('manga', { manga: [{ ...manga, malId: 7, totalChapters: 10, totalVolumes: 3 }], mangaDetail: { totalChapters: 0, totalVolumes: 0 } }, { prefill: 'm' });
		await flush();
		(results().querySelector('.hoard-result-card') as HTMLElement).click();
		await flush();
		expect(state().totalChapters).toBe(10);
		expect(state().totalVolumes).toBe(3);
	});

	it('reports an API failure in the results area', async () => {
		const { results } = setup('book', { fail: new Error('boom') }, { prefill: 'x' });
		await flush();
		expect(results().querySelector('.hoard-modal-error')).not.toBeNull();
	});

	it('discards a superseded lookup', async () => {
		const { modal, api, results } = setup('book', { books: [book] });
		const perform = (modal as unknown as { performLookup: (q: string) => Promise<void> }).performLookup.bind(modal);
		api.searchGoogleBooks.mockImplementationOnce(() => new Promise((r) => setTimeout(() => r([book]), 20)));
		const first = perform('slow');
		await perform('fast');
		await first;
		expect(results().querySelectorAll('.hoard-result-card')).toHaveLength(1);
		expect(api.searchGoogleBooks).toHaveBeenCalledTimes(2);
	});
});

describe('AddReadingModal form', () => {
	it('toggles the open-vault button with the linked page', () => {
		const withLink = setup('book', {}, { initialState: true });
		const open = withLink.modal.contentEl.querySelector('.hoard-reading-modal-header-actions button') as HTMLButtonElement;
		expect(open.disabled).toBe(false);
		expect(open.classList.contains('is-hidden')).toBe(false);
		const none = setup('book');
		const open2 = none.modal.contentEl.querySelector('.hoard-reading-modal-header-actions button') as HTMLButtonElement;
		expect(open2.disabled).toBe(true);
		expect(open2.classList.contains('is-hidden')).toBe(true);
	});

	it('refreshes a link button label from the state', () => {
		const { modal, state } = setup('book', {}, { initialState: true });
		const btn = document.createElement('button');
		(modal as unknown as { linkVaultBtn: HTMLButtonElement }).linkVaultBtn = btn;
		(modal as unknown as { refreshVaultButtons: () => void }).refreshVaultButtons();
		expect(btn.textContent).toBe(t('add.reading.changeLink'));
		expect(btn.title).toBe(t('add.reading.linked', { path: 'a.md' }));
		state().vaultPage = '';
		(modal as unknown as { refreshVaultButtons: () => void }).refreshVaultButtons();
		expect(btn.textContent).toBe(t('add.reading.link'));
		expect(btn.title).toBe(t('add.reading.linkTip'));
	});

	it('renders the pages/words switch only for books and swaps the counters', () => {
		const { modal, state } = setup('book');
		expect(modal.contentEl.textContent).toContain(t('add.reading.pagesRead'));
		const words = Array.from(modal.contentEl.querySelectorAll('button')).find((b) => b.textContent === t('add.reading.words'))!;
		words.click();
		expect(state().progressUnit).toBe('words');
		expect(modal.contentEl.textContent).toContain(t('add.reading.wordsRead'));
		expect(modal.contentEl.textContent).toContain(t('add.reading.totalWords'));
		expect(modal.contentEl.textContent).not.toContain(t('add.reading.pagesRead'));
	});

	it('renders chapter and volume counters for manga without a unit switch', () => {
		const { modal } = setup('manga');
		const text = modal.contentEl.textContent ?? '';
		expect(text).toContain(t('add.reading.volumesRead'));
		expect(text).toContain(t('add.reading.totalVolumes'));
		expect(text).not.toContain(t('add.reading.pagesRead'));
		expect(Array.from(modal.contentEl.querySelectorAll('button')).some((b) => b.textContent === t('add.reading.words'))).toBe(false);
	});
});
