import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadingAddProvider } from '../src/modules/reading/ui/readingAddProvider';
import { searchBooks } from '../src/shared/services/coverRefresh';
import { fakeSettings } from './helpers/fakeSettings';
import { shownNotices } from './helpers/csvWizard';
import type { AddFormContext, AddKind } from '../src/modules/add/exports';

const NOW = '2026-03-04T05:06:07.000Z';

const BOOK = {
	title: 'Dune', author: 'Herbert', year: 1965, coverUrl: 'http://c/1.jpg', googleBooksId: 'g1', openLibraryId: '',
	totalPages: 100, releaseDate: '1965-01-01', url: '',
};
const MANGA = {
	title: 'Berserk', author: 'Miura', year: 1989, coverUrl: '', malId: 2, totalChapters: 0, totalVolumes: 0, releaseDate: '1989-08-25', url: '',
};

interface Over {
	source?: 'google' | 'openlibrary';
	hasKey?: boolean;
	books?: unknown[];
	olBooks?: unknown[];
	manga?: unknown[];
	single?: unknown;
	bookDetail?: unknown;
	olWork?: unknown;
	mangaDetail?: unknown;
	anilistMal?: number | null;
	storedBooks?: unknown[];
	storedManga?: unknown[];
	defaultStatus?: string;
}

function setup(over: Over = {}) {
	const api = {
		hasGoogleBooksKey: vi.fn(() => over.hasKey ?? true),
		searchGoogleBooks: vi.fn(() => Promise.resolve(over.books ?? [BOOK])),
		searchOpenLibrary: vi.fn(() => Promise.resolve(over.olBooks ?? [])),
		getOpenLibraryWork: vi.fn(() => Promise.resolve(over.olWork ?? null)),
		getGoogleBookById: vi.fn(() => Promise.resolve(over.bookDetail ?? null)),
		searchManga: vi.fn(() => Promise.resolve(over.manga ?? [MANGA])),
		getMangaByMalId: vi.fn((id: number) => Promise.resolve(
			over.single !== undefined ? over.single : (id === 2 ? over.mangaDetail ?? MANGA : null))),
		getAniListMangaMalId: vi.fn(() => Promise.resolve(over.anilistMal === undefined ? 2 : over.anilistMal)),
	};
	const saved: Array<{ op: string; item: Record<string, unknown> }> = [];
	const reading = {
		getBooks: () => over.storedBooks ?? [],
		getMangaList: () => over.storedManga ?? [],
		getSettings: () => ({ defaultStatus: over.defaultStatus }),
		generateBookId: (title: string) => `Books/${title}`,
		generateMangaId: (title: string) => `Manga/${title}`,
		addBook: vi.fn((item: Record<string, unknown>) => { saved.push({ op: 'addBook', item: structuredClone(item) }); return Promise.resolve(); }),
		addManga: vi.fn((item: Record<string, unknown>) => { saved.push({ op: 'addManga', item: structuredClone(item) }); return Promise.resolve(); }),
	};
	const settings = fakeSettings({ booksApiSource: over.source ?? 'google', halfStarRatings: false, ratingSystem: [] });
	const provider = createReadingAddProvider({ settings: settings as never, reading: reading as never, api: api as never, searchBooks });
	const done = vi.fn();
	const mount = async (kind: AddKind, query: string, pick: boolean) => {
		const host = document.createElement('div');
		const hit = pick ? (await provider.search(kind, query))[0]! : null;
		const ctx: AddFormContext = { kind, hit, query, target: 'library', back: vi.fn(), done };
		const handle = provider.renderForm(host, ctx);
		const submit = (): void => host.querySelector<HTMLButtonElement>('.hoard-modal__btn-row .hoard-btn--primary')!.click();
		const values = (): string[] => Array.from(host.querySelectorAll<HTMLInputElement>('input')).map((i) => i.value);
		return { host, handle, submit, values };
	};
	return { provider, api, reading, saved, done, mount };
}

beforeEach(() => {
	vi.setSystemTime(NOW);
	shownNotices.length = 0;
});

describe('reading add provider search', () => {
	it('serves books and manga, never as Maybe notes', () => {
		const { provider } = setup();
		expect(provider.kinds).toEqual(['book', 'manga']);
		expect(provider.maybeKinds).toBeUndefined();
	});

	it('book kind uses the effective book source', async () => {
		const google = setup({ source: 'google', hasKey: true });
		const hits = await google.provider.search('book', 'dune');
		expect(google.api.searchGoogleBooks).toHaveBeenCalledWith('dune');
		expect(hits[0]).toMatchObject({ kind: 'book', title: 'Dune', meta: 'Herbert · 1965', thumbUrl: 'http://c/1.jpg' });

		const keyless = setup({ source: 'google', hasKey: false });
		await keyless.provider.search('book', 'dune');
		expect(keyless.api.searchGoogleBooks).not.toHaveBeenCalled();
		expect(keyless.api.searchOpenLibrary).toHaveBeenCalledWith('dune');
	});

	it('manga kind searches Jikan by title', async () => {
		const { provider, api } = setup();
		const hits = await provider.search('manga', 'berserk');
		expect(api.searchManga).toHaveBeenCalledWith('berserk');
		expect(hits[0]).toMatchObject({ kind: 'manga', title: 'Berserk', meta: 'Miura · 1989' });
	});

	it('all-digit manga query looks up by MAL id', async () => {
		const { provider, api } = setup();
		const hits = await provider.search('manga', '2');
		expect(api.getMangaByMalId).toHaveBeenCalledWith(2);
		expect(api.searchManga).not.toHaveBeenCalled();
		expect(hits).toHaveLength(1);
		expect(await setup({ single: null }).provider.search('manga', '99')).toEqual([]);
	});

	it('in-library marker uses the kind\'s own library', async () => {
		const { provider } = setup({
			storedBooks: [{ title: 'Berserk', googleBooksId: 'g1' }],
			storedManga: [{ title: 'Dune', malId: '1' }],
		});
		// the stored book matches the book hit by id
		expect((await provider.search('book', 'dune'))[0]!.inLibrary).toBe('Books');
		// a stored book titled "Berserk" must not mark the Berserk manga
		expect((await provider.search('manga', 'berserk'))[0]!.inLibrary).toBeNull();
	});

	it('marks a manga by its MAL id only against stored manga', async () => {
		const { provider } = setup({ storedManga: [{ title: 'Other', malId: '2' }] });
		expect((await provider.search('manga', 'berserk'))[0]!.inLibrary).toBe('Manga');
	});

	it('falls back to placeholder labels for untitled results without author or year', async () => {
		const { provider } = setup({ books: [{ ...BOOK, title: '', author: '', year: 0, googleBooksId: '' }] });
		const [hit] = await provider.search('book', 'x');
		expect(hit!.title).not.toBe('');
		expect(hit!.meta).not.toBe('');
	});

	it('lets a failing search reject', async () => {
		const { provider, api } = setup();
		api.searchManga.mockRejectedValueOnce(new Error('boom'));
		await expect(provider.search('manga', 'x')).rejects.toThrow('boom');
	});
});

describe('reading add provider links', () => {
	it('returns null at once for text that is no manga link, without any request', async () => {
		const { provider, api } = setup();
		expect(await provider.resolveUrl!('Berserk')).toBeNull();
		expect(await provider.resolveUrl!('https://example.com/manga/2')).toBeNull();
		expect(await provider.resolveUrl!('https://myanimelist.net/anime/52991')).toBeNull();
		expect(await provider.resolveUrl!('https://anilist.co/anime/154587')).toBeNull();
		for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
	});

	it('MyAnimeList manga link resolves via getMangaByMalId', async () => {
		const { provider, api } = setup();
		const hit = await provider.resolveUrl!('https://myanimelist.net/manga/2/Berserk');
		expect(api.getMangaByMalId).toHaveBeenCalledWith(2);
		expect(hit).toMatchObject({ kind: 'manga', title: 'Berserk' });
		expect(await setup({ single: null }).provider.resolveUrl!('https://myanimelist.net/manga/9')).toBeNull();
	});

	it('AniList manga link resolves via its MAL id', async () => {
		const { provider, api } = setup();
		const hit = await provider.resolveUrl!('https://anilist.co/manga/30002/Berserk/');
		expect(api.getAniListMangaMalId).toHaveBeenCalledWith(30002);
		expect(api.getMangaByMalId).toHaveBeenCalledWith(2);
		expect(hit).toMatchObject({ kind: 'manga', title: 'Berserk' });
	});

	it('AniList manga without a MAL id yields no hit', async () => {
		const { provider, api } = setup({ anilistMal: null });
		expect(await provider.resolveUrl!('https://anilist.co/manga/1')).toBeNull();
		expect(api.getMangaByMalId).not.toHaveBeenCalled();
	});

	it('lets a failing AniList lookup reject so the wizard can skip it', async () => {
		const { provider, api } = setup();
		api.getAniListMangaMalId.mockRejectedValueOnce(new Error('boom'));
		await expect(provider.resolveUrl!('https://anilist.co/manga/1')).rejects.toThrow('boom');
	});

	it('a resolved link opens its form with the manga\'s values', async () => {
		const { provider } = setup();
		const hit = (await provider.resolveUrl!('https://myanimelist.net/manga/2'))!;
		const host = document.createElement('div');
		provider.renderForm(host, { kind: 'manga', hit, query: 'x', target: 'library', back: () => {}, done: () => {} });
		expect(host.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('Berserk');
	});
});

describe('reading add form', () => {
	it('book form saves via addBook with enriched page count', async () => {
		const s = setup({ bookDetail: { totalPages: 412, coverUrl: 'http://c/2.jpg' }, defaultStatus: 'Reading' });
		const { submit, values } = await s.mount('book', 'dune', true);
		await vi.waitFor(() => expect(s.api.getGoogleBookById).toHaveBeenCalledWith('g1'));
		await vi.waitFor(() => expect(values()).toContain('412'));
		submit();
		await vi.waitFor(() => expect(s.done).toHaveBeenCalledWith({ kind: 'book', id: 'Books/Dune' }));
		expect(s.saved).toStrictEqual([{
			op: 'addBook',
			item: {
				id: 'Books/Dune', title: 'Dune', author: 'Herbert', status: 'Reading', rating: 0, progressUnit: 'pages',
				pagesRead: 0, totalPages: 412, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0,
				coverUrl: 'http://c/2.jpg', googleBooksId: 'g1', openLibraryId: '', vaultPage: '',
				dateStarted: null, dateFinished: null, releaseDate: '1965-01-01',
				dateAdded: NOW, dateModified: NOW, customFields: {},
			},
		}]);
	});

	it('manga form enriches totals from the detail and saves via addManga', async () => {
		const s = setup({ mangaDetail: { ...MANGA, totalChapters: 364, totalVolumes: 41 } });
		const { submit, values } = await s.mount('manga', 'berserk', true);
		await vi.waitFor(() => expect(values()).toContain('364'));
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
		expect(s.saved[0]).toMatchObject({
			op: 'addManga', item: { id: 'Manga/Berserk', malId: '2', totalChapters: 364, totalVolumes: 41, status: 'Plan to Read' },
		});
		await vi.waitFor(() => expect(s.done).toHaveBeenCalledWith({ kind: 'manga', id: 'Manga/Berserk' }));
	});

	it('keeps the picked manga totals when the detail reports zero', async () => {
		const s = setup({ manga: [{ ...MANGA, totalChapters: 10, totalVolumes: 3 }], mangaDetail: { ...MANGA, totalChapters: 0, totalVolumes: 0 } });
		const { submit } = await s.mount('manga', 'berserk', true);
		await vi.waitFor(() => expect(s.api.getMangaByMalId).toHaveBeenCalledWith(2));
		await new Promise((r) => setTimeout(r, 0));
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
		expect(s.saved[0]!.item).toMatchObject({ totalChapters: 10, totalVolumes: 3 });
	});

	it('a failing manga detail lookup keeps the form usable', async () => {
		const s = setup();
		s.api.getMangaByMalId.mockRejectedValueOnce(new Error('boom'));
		const { submit } = await s.mount('manga', 'berserk', true);
		await new Promise((r) => setTimeout(r, 0));
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
	});

	it('Open Library work only fills an empty cover and keeps typed values', async () => {
		const row = { ...BOOK, googleBooksId: '', openLibraryId: 'OL1W', author: '', totalPages: 0, coverUrl: '' };
		const s = setup({ source: 'openlibrary', hasKey: false, olBooks: [row], olWork: { author: 'Frank', totalPages: 412, coverUrl: 'http://c/ol.jpg', releaseDate: '' } });
		const { host, submit, values } = await s.mount('book', 'dune', true);
		const author = host.querySelectorAll<HTMLInputElement>('input[type=text]')[1]!;
		author.value = 'Typed';
		author.dispatchEvent(new Event('input'));
		await vi.waitFor(() => expect(values()).toContain('http://c/ol.jpg'));
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
		expect(s.saved[0]!.item).toMatchObject({ openLibraryId: 'OL1W', author: 'Typed', totalPages: 0, coverUrl: 'http://c/ol.jpg' });
	});

	it('a manual form starts from the query and a words toggle swaps the counters', async () => {
		const s = setup();
		const { host, submit } = await s.mount('book', 'My Novel', false);
		expect(host.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('My Novel');
		Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Words')!.click();
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
		expect(s.saved[0]!.item).toMatchObject({ id: 'Books/My Novel', progressUnit: 'words' });
	});

	it('manga form has no pages/words switch', async () => {
		const { host } = await setup().mount('manga', 'x', false);
		expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'Words')).toBe(false);
	});

	it('refuses an empty title', async () => {
		const s = setup();
		const { submit } = await s.mount('book', '  ', false);
		submit();
		expect(s.saved).toHaveLength(0);
		expect(shownNotices.length).toBeGreaterThan(0);
		expect(s.done).not.toHaveBeenCalled();
	});

	it('manga duplicate asks before adding', async () => {
		const s = setup({ storedManga: [{ title: 'berserk', malId: '' }] });
		const { host, submit } = await s.mount('manga', 'Berserk', false);
		submit();
		await new Promise((r) => setTimeout(r, 0));
		expect(s.saved).toHaveLength(0);
		const warning = host.querySelector('.hoard-modal__duplicate-warning')!;
		expect(warning).not.toBeNull();
		warning.querySelector<HTMLButtonElement>('.hoard-btn--primary')!.click();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
	});

	it('a book of the same title does not block a manga', async () => {
		const s = setup({ storedBooks: [{ title: 'Berserk' }] });
		const { submit } = await s.mount('manga', 'Berserk', false);
		submit();
		await vi.waitFor(() => expect(s.saved).toHaveLength(1));
	});
});
