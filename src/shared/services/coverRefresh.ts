import type { ApiService, BookSearchResult, GameSearchResult } from '../api/ApiService';
import type { ApiCheckQueue } from '../api/apiCheckQueue';
import type { PosterService } from '../api/PosterService';
import type { Game } from '../../modules/games/contract';
import type { Book, Manga } from '../../modules/reading/contract';
import type { HoardPluginSettings } from '../../modules/settings/contract';
import type { HoardTitle } from '../../modules/watchlist/contract';
import { effectiveBookSource, effectiveGameSource } from '../api/apiSources';
import { steamLibraryCover } from '../api/steamStoreApi';

/** What the game cover lookups call on the API service. */
export type GameCoverApi = Pick<
	ApiService,
	| 'steamCoverExists' | 'getIgdbGameDetails' | 'getRawgGameDetails'
	| 'searchIgdbGames' | 'searchRawgGames' | 'searchSteamStore'
	| 'hasRawgKey' | 'hasIgdbCredentials'
>;
/** What book searches call on the API service. */
export type BookSearchApi = Pick<ApiService, 'searchGoogleBooks' | 'searchOpenLibrary' | 'hasGoogleBooksKey'>;
/** What the book and manga cover-by-id lookups call on the API service. */
export type ReadingCoverApi = Pick<ApiService, 'getOpenLibraryWork' | 'getGoogleBookById' | 'getMangaByMalId'>;

export interface GameCover { url: string; source: '' | 'rawg' | 'igdb' | 'steam'; apiId: string }

/**
 * Resolves a game cover through the games APIs: by stored id when the game has one, otherwise (unless
 * `idOnly`) a title search whose first result is taken — returning that result's source + id so the
 * caller can persist them. `source` is '' when there is nothing new to store. Never throws.
 */
export async function resolveGameCover(
	api: GameCoverApi,
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

async function gameCoverById(api: GameCoverApi, source: string, apiId: string): Promise<string> {
	if (source === 'steam') return (await api.steamCoverExists(apiId)) ? steamLibraryCover(apiId) : '';
	const details = source === 'igdb'
		? await api.getIgdbGameDetails(Number(apiId))
		: await api.getRawgGameDetails(Number(apiId));
	return details?.coverUrl ?? '';
}

function searchGamesByTitle(api: GameCoverApi, source: 'steam' | 'rawg' | 'igdb', title: string): Promise<GameSearchResult[]> {
	if (source === 'igdb') return api.searchIgdbGames(title);
	if (source === 'rawg') return api.searchRawgGames(title);
	return api.searchSteamStore(title);
}

/** Book search via the effective source: Google Books with a key and chosen, else keyless Open Library. */
export function searchBooks(
	api: BookSearchApi,
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

async function bookCoverById(api: ReadingCoverApi, book: Book): Promise<string> {
	if (book.openLibraryId) return (await api.getOpenLibraryWork(book.openLibraryId))?.coverUrl ?? '';
	return book.googleBooksId ? (await api.getGoogleBookById(book.googleBooksId))?.coverUrl ?? '' : '';
}

/** The cover of a book (Open Library or Google Books id) or manga (MAL id); '' without id or cover. Throws on API errors. */
export async function fetchReadingCoverById(api: ReadingCoverApi, kind: 'book' | 'manga', item: Book | Manga): Promise<string> {
	if (kind === 'book') return bookCoverById(api, item as Book);
	const malId = (item as Manga).malId;
	return malId ? (await api.getMangaByMalId(Number(malId)))?.coverUrl ?? '' : '';
}

/** What the bulk refresh reads of the watchlist. */
export interface CoverTitles { getTitles(): HoardTitle[] }
/** What the bulk refresh reads and writes of books and manga. */
export interface CoverReadingData {
	getBooks(): Book[];
	getMangaList(): Manga[];
	getBook(id: string): Book | undefined;
	getManga(id: string): Manga | undefined;
	updateBook(updated: Book): Promise<void>;
	updateManga(updated: Manga): Promise<void>;
}
/** What the bulk refresh reads and writes of games. */
export interface CoverGameData {
	getGames(): Game[];
	getGame(id: string): Game | undefined;
	updateGame(updated: Game): Promise<void>;
}

/** Runtime data of one refresh run. */
export interface CoverRefreshOptions {
	gamesApiSource: 'steam' | 'rawg' | 'igdb';
	/** called once with the number of entries to process */
	onStart?: (total: number) => void;
}

export interface CoverRefreshResult { total: number; updated: number; unchanged: number }

function canRefreshBook(b: Book, canGoogle: boolean): boolean {
	return !!(b.openLibraryId || (b.googleBooksId && canGoogle));
}

/**
 * Bulk refresh: every entry's note image is replaced by the API image, but only when the fetch returned
 * a URL — a field is never cleared, a failed or empty fetch leaves the note alone. Entries without an API
 * id (books, manga, games) are skipped. Reading and games fetches go through the shared throttled queue,
 * title posters through the poster queue.
 */
export class CoverRefresher {
	constructor(
		private readonly api: GameCoverApi & ReadingCoverApi & BookSearchApi,
		private readonly titles: CoverTitles,
		private readonly posterService: Pick<PosterService, 'enqueue'>,
		private readonly readingData: CoverReadingData,
		private readonly gameData: CoverGameData,
		private readonly queue: Pick<ApiCheckQueue, 'enqueue'>,
	) {}

	async refreshAll(opts: CoverRefreshOptions): Promise<CoverRefreshResult> {
		const titles = this.titles.getTitles();
		const books = this.readingData.getBooks();
		const manga = this.readingData.getMangaList();
		const games = this.gameData.getGames();
		const canBooks = this.api.hasGoogleBooksKey();
		const result: CoverRefreshResult = { total: titles.length + books.length + manga.length + games.length, updated: 0, unchanged: 0 };
		opts.onStart?.(result.total);

		const none = Promise.resolve(false);
		const jobs: Array<Promise<boolean>> = [
			...titles.map((t) => this.posterJob(t)),
			...books.map((b) => (canRefreshBook(b, canBooks)
				? this.queuedCoverJob(b.coverUrl, () => fetchReadingCoverById(this.api, 'book', b), (url) => this.storeBookCover(b.id, url))
				: none)),
			...manga.map((m) => (m.malId
				? this.queuedCoverJob(m.coverUrl, () => fetchReadingCoverById(this.api, 'manga', m), (url) => this.storeMangaCover(m.id, url))
				: none)),
			...games.map((g) => this.queuedCoverJob(
				g.coverUrl,
				async () => (await resolveGameCover(this.api, opts.gamesApiSource, g, true)).url,
				(url) => this.storeGameCover(g.id, url),
			)),
		];
		for (const changed of await Promise.all(jobs)) {
			if (changed) result.updated++;
			else result.unchanged++;
		}
		return result;
	}

	private posterJob(t: HoardTitle): Promise<boolean> {
		return (async () => {
			const url = await this.posterService.enqueue(t, true);
			return !!url && url !== t.posterUrl;
		})().catch(() => false);
	}

	/** Queued fetch → store; true only when a fetched URL differs from the previous one. Failures count as unchanged. */
	private queuedCoverJob(
		prev: string,
		fetchUrl: () => Promise<string>,
		store: (url: string) => Promise<boolean>,
	): Promise<boolean> {
		return this.queue.enqueue(async () => {
			const url = await fetchUrl();
			if (!url || !(await store(url))) return false;
			return url !== prev;
		}).catch(() => false);
	}

	private async storeBookCover(id: string, coverUrl: string): Promise<boolean> {
		const fresh = this.readingData.getBook(id);
		if (fresh) await this.readingData.updateBook({ ...fresh, coverUrl });
		return !!fresh;
	}

	private async storeMangaCover(id: string, coverUrl: string): Promise<boolean> {
		const fresh = this.readingData.getManga(id);
		if (fresh) await this.readingData.updateManga({ ...fresh, coverUrl });
		return !!fresh;
	}

	private async storeGameCover(id: string, coverUrl: string): Promise<boolean> {
		const fresh = this.gameData.getGame(id);
		if (fresh) await this.gameData.updateGame({ ...fresh, coverUrl });
		return !!fresh;
	}
}
