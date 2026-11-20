import type { AddHit, AddKind, AddProvider } from '../../add/exports';
import type { BookSearchResult, MangaSearchResult } from '../../../shared/api/ApiService';
import { t } from '../../../shared/i18n';
import { LibraryIndex, bookResultIdKeys, mangaResultIdKeys } from '../../../shared/services/LibraryIndex';
import type { SettingsReader } from '../../settings/exports';
import {
	mountReadingAddForm,
	type AddReadingApi,
	type AddReadingStore,
	type BookSearcher,
	type ReadingRow,
} from './ReadingAddForm';

const KINDS: readonly AddKind[] = ['book', 'manga'];
/** Hits whose search row the provider still remembers; older ones fall out. */
const REMEMBERED_RESULTS = 500;

const MAL_MANGA_LINK_RE = /myanimelist\.net\/manga\/(\d+)/i;
const ANILIST_MANGA_LINK_RE = /anilist\.co\/manga\/(\d+)/i;

function bookHitId(book: BookSearchResult): string {
	if (book.googleBooksId) return `gbooks:${book.googleBooksId}`;
	return book.openLibraryId ? `openlibrary:${book.openLibraryId}` : `title:${book.title}`;
}

function metaOf(result: { author: string; year: number }): string {
	return [result.author || t('add.reading.unknownAuthor'), result.year ? String(result.year) : ''].filter(Boolean).join(' · ');
}

/** The Reading module's side of the add wizard: books and manga. */
export function createReadingAddProvider({ settings, reading, api, searchBooks }: {
	settings: SettingsReader;
	reading: AddReadingStore;
	api: AddReadingApi;
	searchBooks: BookSearcher;
}): AddProvider {
	// search rows by `${kind}:${hit.id}`, so a picked hit still carries its source record into the form
	const rows = new Map<string, ReadingRow>();

	const remember = (hit: AddHit, row: ReadingRow): AddHit => {
		rows.set(`${hit.kind}:${hit.id}`, row);
		for (const oldest of rows.keys()) {
			if (rows.size <= REMEMBERED_RESULTS) break;
			rows.delete(oldest);
		}
		return hit;
	};

	// separate indexes: a manga and a book of the same title (or MAL id) must not mark each other
	const bookHit = (book: BookSearchResult, library: LibraryIndex): AddHit => remember({
		kind: 'book',
		id: bookHitId(book),
		title: book.title || t('add.reading.untitled'),
		meta: metaOf(book),
		thumbUrl: book.coverUrl,
		fallbackIcon: '📖',
		inLibrary: library.lookup(bookResultIdKeys(book), book.title),
	}, { kind: 'book', result: book });

	const mangaHit = (manga: MangaSearchResult, library: LibraryIndex): AddHit => remember({
		kind: 'manga',
		id: `mal:${manga.malId}`,
		title: manga.title || t('add.reading.untitled'),
		meta: metaOf(manga),
		thumbUrl: manga.coverUrl,
		fallbackIcon: '📓',
		inLibrary: library.lookup(mangaResultIdKeys(manga), manga.title),
	}, { kind: 'manga', result: manga });

	// built per call because the library changes between searches
	const bookLibrary = (): LibraryIndex => LibraryIndex.build({ books: () => reading.getBooks() }, ['books']);
	const mangaLibrary = (): LibraryIndex => LibraryIndex.build({ manga: () => reading.getMangaList() }, ['manga']);

	const searchManga = async (query: string): Promise<MangaSearchResult[]> => {
		if (!/^\d+$/.test(query)) return await api.searchManga(query);
		const single = await api.getMangaByMalId(parseInt(query, 10));
		return single ? [single] : [];
	};

	return {
		kinds: KINDS,

		async search(kind, query) {
			if (kind === 'book') {
				const library = bookLibrary();
				return (await searchBooks(api, settings.get(), query)).map((book) => bookHit(book, library));
			}
			const library = mangaLibrary();
			return (await searchManga(query)).map((manga) => mangaHit(manga, library));
		},

		renderForm(host, ctx) {
			const row = ctx.hit ? rows.get(`${ctx.kind}:${ctx.hit.id}`) ?? null : null;
			return mountReadingAddForm(host, settings, reading, api, ctx, row);
		},

		async resolveUrl(text) {
			const input = text.trim();
			const mal = input.match(MAL_MANGA_LINK_RE);
			const anilist = mal ? null : input.match(ANILIST_MANGA_LINK_RE);
			if (!mal && !anilist) return null;
			// an AniList manga is looked up through its MyAnimeList id
			const malId = mal ? parseInt(mal[1]!, 10) : await api.getAniListMangaMalId(parseInt(anilist![1]!, 10));
			if (!malId) return null;
			const manga = await api.getMangaByMalId(malId);
			return manga ? mangaHit(manga, mangaLibrary()) : null;
		},
	};
}
