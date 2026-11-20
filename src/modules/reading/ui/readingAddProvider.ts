import { Notice } from 'obsidian';
import type { AddHit, AddKind, AddProvider } from '../../add/exports';
import { apiErrorMessage, type BookSearchResult, type MangaSearchResult } from '../../../shared/api/ApiService';
import { t } from '../../../shared/i18n';
import { LibraryIndex, bookResultIdKeys, mangaResultIdKeys } from '../../../shared/services/LibraryIndex';
import { RecentRows } from '../../../shared/services/recentRows';
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
	const rows = new RecentRows<ReadingRow>(REMEMBERED_RESULTS);

	const remember = (hit: AddHit, row: ReadingRow): AddHit => {
		rows.set(`${hit.kind}:${hit.id}`, row);
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

	return {
		kinds: KINDS,

		async search(kind, query) {
			// a number is a title like any other text; a MAL id is looked up through its link
			if (kind === 'book') {
				const library = bookLibrary();
				const hits = (await searchBooks(api, settings.get(), query)).map((book) => bookHit(book, library));
				rows.trim();
				return hits;
			}
			const library = mangaLibrary();
			const hits = (await api.searchManga(query)).map((manga) => mangaHit(manga, library));
			rows.trim();
			return hits;
		},

		renderForm(host, ctx) {
			const row = ctx.hit ? rows.get(`${ctx.kind}:${ctx.hit.id}`) ?? null : null;
			if (ctx.hit && !row) new Notice(t('add.url.lookupExpired'));
			return mountReadingAddForm(host, settings, reading, api, ctx, row);
		},

		async resolveUrl(text) {
			const input = text.trim();
			const mal = input.match(MAL_MANGA_LINK_RE);
			const anilist = mal ? null : input.match(ANILIST_MANGA_LINK_RE);
			if (!mal && !anilist) return null;
			try {
				// an AniList manga is looked up through its MyAnimeList id
				const malId = mal ? parseInt(mal[1]!, 10) : await api.getAniListMangaMalId(parseInt(anilist![1]!, 10));
				const manga = malId ? await api.getMangaByMalId(malId) : null;
				if (!manga) return { message: t('add.url.notFound') };
				const hit = mangaHit(manga, mangaLibrary());
				rows.trim();
				return hit;
			} catch (err) {
				return { message: apiErrorMessage(err) };
			}
		},
	};
}
