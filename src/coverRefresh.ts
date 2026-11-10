import type { ApiService, BookSearchResult, GameSearchResult } from './ApiService';
import type { ApiCheckQueue } from './apiCheckQueue';
import type { GameDataManager } from './GameDataManager';
import type { ReadingDataManager, ReadingKind } from './ReadingDataManager';
import type { PosterService } from './PosterService';
import type { DataManager } from './DataManager';
import type { Book, Game, HoardPluginSettings, HoardTitle, Manga } from './types';
import { effectiveBookSource, effectiveGameSource } from './apiSources';
import { steamLibraryCover } from './steamStoreApi';

export interface GameCover { url: string; source: '' | 'rawg' | 'igdb' | 'steam'; apiId: string }

/**
 * Resolves a game cover through the games APIs: by stored id when the game has one, otherwise (unless
 * `idOnly`) a title search whose first result is taken — returning that result's source + id so the
 * caller can persist them. `source` is '' when there is nothing new to store. Never throws.
 */
export async function resolveGameCover(
	api: ApiService,
	searchSource: 'steam' | 'rawg' | 'igdb',
	game: Game,
	idOnly = false,
): Promise<GameCover> {
	const none: GameCover = { url: '', source: '', apiId: '' };
	try {
		if (game.apiSource && game.apiId) {
			const url = await gameCoverById(api, game.apiSource, game.apiId);
			return url ? { url, source: '', apiId: '' } : none;
		}
		if (idOnly) return none;
		// no stored id (added manually or before the field existed) — search by title
		const results = await searchGamesByTitle(api, effectiveGameSource({ gamesApiSource: searchSource }, api), game.title);
		const first = results[0];
		if (!first || !first.coverUrl) return none;
		return { url: first.coverUrl, source: first.source, apiId: String(first.id) };
	} catch {
		return none;
	}
}

async function gameCoverById(api: ApiService, source: string, apiId: string): Promise<string> {
	if (source === 'steam') return steamLibraryCover(apiId);
	const details = source === 'igdb'
		? await api.getIgdbGameDetails(Number(apiId))
		: await api.getRawgGameDetails(Number(apiId));
	return details?.coverUrl ?? '';
}

function searchGamesByTitle(api: ApiService, source: 'steam' | 'rawg' | 'igdb', title: string): Promise<GameSearchResult[]> {
	if (source === 'igdb') return api.searchIgdbGames(title);
	if (source === 'rawg') return api.searchRawgGames(title);
	return api.searchSteamStore(title);
}

/** Book search via the effective source: Google Books with a key and chosen, else keyless Open Library. */
export function searchBooks(
	api: ApiService,
	settings: Pick<HoardPluginSettings, 'booksApiSource'>,
	query: string,
): Promise<BookSearchResult[]> {
	return effectiveBookSource(settings, api) === 'google' ? api.searchGoogleBooks(query) : api.searchOpenLibrary(query);
}

/** Cover and persistable source id of a search hit; empty when either is missing. */
export function firstBookCover(hit: BookSearchResult | undefined): { url: string; sourceId: string } {
	const sourceId = hit?.googleBooksId || hit?.openLibraryId || '';
	return hit?.coverUrl && sourceId ? { url: hit.coverUrl, sourceId } : { url: '', sourceId: '' };
}

async function bookCoverById(api: ApiService, book: Book): Promise<string> {
	if (book.openLibraryId) return (await api.getOpenLibraryWork(book.openLibraryId))?.coverUrl ?? '';
	return book.googleBooksId ? (await api.getGoogleBookById(book.googleBooksId))?.coverUrl ?? '' : '';
}

/** The cover of a book (Open Library or Google Books id) or manga (MAL id); '' without id or cover. Throws on API errors. */
export async function fetchReadingCoverById(api: ApiService, kind: ReadingKind, item: Book | Manga): Promise<string> {
	if (kind === 'book') return bookCoverById(api, item as Book);
	const malId = (item as Manga).malId;
	return malId ? (await api.getMangaByMalId(Number(malId)))?.coverUrl ?? '' : '';
}

export interface CoverRefreshDeps {
	api: ApiService;
	gamesApiSource: 'steam' | 'rawg' | 'igdb';
	dataManager: Pick<DataManager, 'getTitles'>;
	posterService: Pick<PosterService, 'enqueue'>;
	readingData: Pick<ReadingDataManager, 'getBooks' | 'getMangaList' | 'getBook' | 'getManga' | 'updateBook' | 'updateManga'>;
	gameData: Pick<GameDataManager, 'getGames' | 'getGame' | 'updateGame'>;
	queue: Pick<ApiCheckQueue, 'enqueue'>;
	/** called once with the number of entries to process */
	onStart?: (total: number) => void;
}

export interface CoverRefreshResult { total: number; updated: number; unchanged: number }

/**
 * Bulk refresh: every entry's note image is replaced by the API image, but only when the fetch returned
 * a URL — a field is never cleared, a failed or empty fetch leaves the note alone. Entries without an API
 * id (books, manga, games) are skipped. Reading and games fetches go through the shared throttled queue,
 * title posters through the poster queue.
 */
export async function refreshAllCovers(d: CoverRefreshDeps): Promise<CoverRefreshResult> {
	const titles = d.dataManager.getTitles();
	const books = d.readingData.getBooks();
	const manga = d.readingData.getMangaList();
	const games = d.gameData.getGames();
	const canBooks = d.api.hasGoogleBooksKey();
	const result: CoverRefreshResult = { total: titles.length + books.length + manga.length + games.length, updated: 0, unchanged: 0 };
	d.onStart?.(result.total);

	const none = Promise.resolve(false);
	const jobs: Array<Promise<boolean>> = [
		...titles.map((t) => posterJob(d, t)),
		...books.map((b) => (canRefreshBook(b, canBooks)
			? queuedCoverJob(d, b.coverUrl, () => fetchReadingCoverById(d.api, 'book', b), (url) => storeBookCover(d, b.id, url))
			: none)),
		...manga.map((m) => (m.malId
			? queuedCoverJob(d, m.coverUrl, () => fetchReadingCoverById(d.api, 'manga', m), (url) => storeMangaCover(d, m.id, url))
			: none)),
		...games.map((g) => queuedCoverJob(
			d,
			g.coverUrl,
			async () => (await resolveGameCover(d.api, d.gamesApiSource, g, true)).url,
			(url) => storeGameCover(d, g.id, url),
		)),
	];
	for (const changed of await Promise.all(jobs)) {
		if (changed) result.updated++;
		else result.unchanged++;
	}
	return result;
}

function canRefreshBook(b: Book, canGoogle: boolean): boolean {
	return !!(b.openLibraryId || (b.googleBooksId && canGoogle));
}

function posterJob(d: CoverRefreshDeps, t: HoardTitle): Promise<boolean> {
	return (async () => {
		const url = await d.posterService.enqueue(t, true);
		return !!url && url !== t.posterUrl;
	})().catch(() => false);
}

/** Queued fetch → store; true only when a fetched URL differs from the previous one. Failures count as unchanged. */
function queuedCoverJob(
	d: CoverRefreshDeps,
	prev: string,
	fetchUrl: () => Promise<string>,
	store: (url: string) => Promise<boolean>,
): Promise<boolean> {
	return d.queue.enqueue(async () => {
		const url = await fetchUrl();
		if (!url || !(await store(url))) return false;
		return url !== prev;
	}).catch(() => false);
}

async function storeBookCover(d: CoverRefreshDeps, id: string, coverUrl: string): Promise<boolean> {
	const fresh = d.readingData.getBook(id);
	if (fresh) await d.readingData.updateBook({ ...fresh, coverUrl });
	return !!fresh;
}

async function storeMangaCover(d: CoverRefreshDeps, id: string, coverUrl: string): Promise<boolean> {
	const fresh = d.readingData.getManga(id);
	if (fresh) await d.readingData.updateManga({ ...fresh, coverUrl });
	return !!fresh;
}

async function storeGameCover(d: CoverRefreshDeps, id: string, coverUrl: string): Promise<boolean> {
	const fresh = d.gameData.getGame(id);
	if (fresh) await d.gameData.updateGame({ ...fresh, coverUrl });
	return !!fresh;
}
