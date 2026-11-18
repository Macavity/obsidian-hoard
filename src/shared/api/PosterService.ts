import type { RequestUrlParam } from 'obsidian';
import { explicitMediaKind, titleMediaKind } from './cinemetaApi';
import type { DataManager } from './DataManager';
import type { HoardTitle, HoardPluginSettings, MediaSearchResult } from './types';
import { getApiGroupForType } from './types';
import { httpsOrEmpty } from './httpsUrl';
import { found, attempt, firstFound, FAILED, NO_KEY, type LookupResult, type LookupSource } from './lookup';
import { at, readList, readOptionalString, readString } from './storage/read';
import { jsonPost, lookupOfError, requestVia, type ApiService } from './ApiService';
import { resolveJikanEndpoint, type JikanEndpoint } from './jikanBase';

const OMDB_BASE = 'https://www.omdbapi.com';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w300';
const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

// rate-limit delays between consecutive queued requests
const JIKAN_DELAY_MS = 400; // ≈2.5 req/sec (Jikan caps at 3/sec)
const ANILIST_DELAY_MS = 700; // AniList caps at 90/min
const TMDB_DELAY_MS = 30;   // ≈33 req/sec (TMDB caps at 40/sec)
const OMDB_DELAY_MS = 100;
const CINEMETA_DELAY_MS = 200;

interface QueueItem {
	title: HoardTitle;
	resolve: (url: string | null) => void;
	/** explicit refresh: replace the title's poster */
	overwrite: boolean;
}

/** What the poster fetch records and persists on the watchlist. */
export type PosterTitles = Pick<DataManager, 'recordLookup' | 'updatePosterUrl' | 'lookupDue'>;

export class PosterService {
	private dataManager: PosterTitles;
	private getSettings: () => HoardPluginSettings;
	private queue: QueueItem[] = [];
	private isProcessing = false;
	private disposed = false;
	private getApi?: () => ApiService;

	constructor(
		dataManager: PosterTitles,
		getSettings: () => HoardPluginSettings,
		getApi?: () => ApiService,
	) {
		this.dataManager = dataManager;
		this.getSettings = getSettings;
		this.getApi = getApi;
	}

	/** Read per request so a settings change applies without a reload. */
	private jikan(): JikanEndpoint {
		return resolveJikanEndpoint(this.getSettings().jikanBaseUrl);
	}

	destroy(): void {
		this.disposed = true;
		this.clearQueue();
	}

	/**
	 * Enqueue a poster fetch for a title. Resolves with the URL or null; the result is also persisted
	 * via DataManager.updatePosterUrl: into the note when its poster is empty, or always with `overwrite`
	 * (the explicit refresh, which also ignores the poster the title has).
	 */
	enqueue(title: HoardTitle, overwrite = false): Promise<string | null> {
		return new Promise((resolve) => {
			if (this.disposed) { resolve(null); return; }
			this.queue.push({ title, resolve, overwrite });
			void this.processQueue();
		});
	}

	/** Empty the queue and resolve all pending promises with null. */
	clearQueue(): void {
		const pending = this.queue.splice(0);
		for (const item of pending) {
			item.resolve(null);
		}
	}

	private async processQueue(): Promise<void> {
		if (this.isProcessing) return;
		this.isProcessing = true;

		while (this.queue.length > 0) {
			if (this.disposed) break;
			const item = this.queue.shift();
			if (!item) break;
			let searched = true;
			try {
				const result = await this.fetchPosterForTitle(item.title, item.overwrite);
				if (this.disposed) { item.resolve(null); break; }
				searched = result !== null;
				item.resolve(await this.settle(item.title, item.overwrite, result));
			} catch {
				// a rejected key or a dropped connection must not count as "no poster"
				this.dataManager.recordLookup(item.title.id, 'poster', FAILED);
				item.resolve(null);
			}

			// the delay spaces out requests; a title that sent none needs none
			const delay = searched ? this.getDelayForTitle(item.title) : 0;
			if (delay > 0) {
				await new Promise<void>((r) => window.setTimeout(r, delay));
			}
		}

		this.isProcessing = false;
	}

	/** Persists a search outcome; null means no search ran (not due, no poster source), so nothing is recorded. */
	private async settle(title: HoardTitle, overwrite: boolean, result: LookupResult<string> | null): Promise<string | null> {
		if (!result) return null;
		if (result.status !== 'found') {
			this.dataManager.recordLookup(title.id, 'poster', result);
			return null;
		}
		await this.dataManager.updatePosterUrl(title.id, result.value, overwrite);
		return result.value;
	}

	private getDelayForTitle(title: HoardTitle): number {
		const settings = this.getSettings();
		const group = getApiGroupForType(title.type, settings.typeApiMapping);
		if (group === 'anime') {
			if (title.anilistId && title.anilistId > 0) return ANILIST_DELAY_MS;
			return JIKAN_DELAY_MS;
		}
		if (settings.tmdbApiKey) return TMDB_DELAY_MS;
		if (settings.omdbApiKey) return OMDB_DELAY_MS;
		return CINEMETA_DELAY_MS;
	}

	/** The search outcome, or null when no search ran (not due, no poster source for the type). */
	private async fetchPosterForTitle(title: HoardTitle, overwrite: boolean): Promise<LookupResult<string> | null> {
		// the title already has one (a refresh looks it up again)
		if (!overwrite) {
			if (title.posterUrl && title.posterUrl.startsWith('http')) return found(title.posterUrl);
			if (!this.dataManager.lookupDue(title.id, 'poster')) return null;
		}

		const settings = this.getSettings();
		const group = getApiGroupForType(title.type, settings.typeApiMapping);
		if (group !== 'anime' && group !== 'movie') return null;
		if (group === 'anime') return attempt(() => this.fetchAnimePoster(title), lookupOfError);
		return firstFound(this.mediaSources(title, settings));
	}

	private cleanTitleForSearch(name: string): string {
		const cleaned = name
			.replace(/\s*-?\s*[Ss]eason\s*\d+/gi, '')
			.replace(/\s*-?\s*[Ss]eries\s*\d+/gi, '')
			.replace(/\s*-?\s*[Pp]art\s*\d+/gi, '')
			.replace(/\s*-?\s*[Vv]ol(ume)?\.?\s*\d+/gi, '')
			.replace(/\s*\(\d{4}\)/g, '')
			.replace(/\s*-?\s*[Ss]\d+/gi, '')
			.replace(/\s+/g, ' ')
			.trim();
		return cleaned || name;
	}

	private async fetchAnimePoster(title: HoardTitle): Promise<string | null> {
		if (title.anilistId && title.anilistId > 0) {
			const gql = `query ($id: Int) { Media(id: $id, type: ANIME) { coverImage { large medium } } }`;
			const data = await this.postJson(ANILIST_ENDPOINT, { query: gql, variables: { id: title.anilistId } });
			const cover = at(data, 'data', 'Media', 'coverImage');
			return httpsOrEmpty(readString(at(cover, 'large')) || readString(at(cover, 'medium'))) || null;
		}
		if (title.malId) {
			const data = await this.fetchJson(`${this.jikan().base}/anime/${title.malId}`);
			return jikanCover(at(data, 'data', 'images', 'jpg'));
		}
		const q = encodeURIComponent(this.cleanTitleForSearch(title.title));
		const data = await this.fetchJson(`${this.jikan().base}/anime?q=${q}&limit=1`);
		return jikanCover(at(data, 'data', 0, 'images', 'jpg'));
	}

	/** Extracts an IMDb id (`tt…`) from an external link, or '' when absent. */
	private extractImdbId(externalLink: string | undefined): string {
		const m = (externalLink ?? '').match(/tt\d+/);
		return m ? m[0] : '';
	}

	/** The 4-digit year from the entry's stored releaseDate, or null when unusable. */
	private getReleaseYear(title: HoardTitle): number | null {
		const m = (title.releaseDate ?? '').match(/^(\d{4})/);
		return m && m[1] ? parseInt(m[1], 10) : null;
	}

	/**
	 * Movie or TV series? Explicit Movie / TV Show types win; otherwise infer from totalEpisodes
	 * (1 → movie, >1 → series). null when there is no signal, so the caller falls back to multi-search.
	 */
	private resolveMediaKind(title: HoardTitle): 'movie' | 'tv' | null {
		return titleMediaKind(title);
	}

	/**
	 * Best poster from TMDB search results: prefers a candidate whose release year matches the entry,
	 * else the first result that has one. Returns the raw poster_path, not the full URL.
	 */
	private pickTmdbPoster(results: unknown, year: number | null): string | null {
		const candidates = readList(results, (r) => {
			const path = readOptionalString(at(r, 'poster_path'));
			if (!path) return undefined;
			const date = readOptionalString(at(r, 'release_date')) ?? readString(at(r, 'first_air_date'));
			return { path, date };
		});
		const matched = year === null ? undefined : candidates.find((c) => c.date.startsWith(String(year)));
		return (matched ?? candidates[0])?.path ?? null;
	}

	/** TMDB, then OMDb, then Cinemeta; a source without a key (or Cinemeta without an api) reports nokey. */
	private mediaSources(title: HoardTitle, settings: HoardPluginSettings): LookupSource<string>[] {
		return [
			() => (settings.tmdbApiKey ? attempt(() => this.fetchTmdbPoster(title, settings), lookupOfError) : Promise.resolve(NO_KEY)),
			() => (settings.omdbApiKey ? attempt(() => this.fetchOmdbPoster(title, settings), lookupOfError) : Promise.resolve(NO_KEY)),
			() => (this.getApi ? attempt(() => this.fetchCinemetaPoster(title), lookupOfError) : Promise.resolve(NO_KEY)),
		];
	}

	/** Keyless fallback: by IMDb id when known, else a title search. Errors propagate (never cached as 'none'). */
	private async fetchCinemetaPoster(title: HoardTitle): Promise<string | null> {
		const api = this.getApi?.();
		if (!api) return null;
		const kind = explicitMediaKind(title);
		const imdbId = this.extractImdbId(title.externalLink);
		if (imdbId) {
			// unknown kind: series first, the movie endpoint answers series ids with a foreign film
			for (const k of kind ? [kind] : (['tv', 'movie'] as const)) {
				const hit = await api.getCinemetaDetails(imdbId, k).catch((e: unknown) => {
					// no such record of this kind: try the other one, then the title search
					if (lookupOfError(e).status === 'notfound') return null;
					throw e;
				});
				if (hit?.posterUrl) return hit.posterUrl;
			}
		}
		return this.searchCinemetaPoster(api, title, kind);
	}

	private async searchCinemetaPoster(api: ApiService, title: HoardTitle, kind: 'movie' | 'tv' | null): Promise<string | null> {
		const kinds = cinemetaKinds(kind);
		const name = this.cleanTitleForSearch(title.title);
		const year = this.getReleaseYear(title);
		for (const k of kinds) {
			const rows = await api.searchCinemeta(name, k, year === null ? undefined : String(year));
			const poster = this.pickCinemetaPoster(rows, year);
			if (poster) return poster;
		}
		return null;
	}

	private pickCinemetaPoster(rows: MediaSearchResult[], year: number | null): string | null {
		const withPoster = rows.filter((r) => r.posterUrl);
		const matched = year === null ? undefined : withPoster.find((r) => (r.releaseDate ?? '').startsWith(String(year)));
		return (matched ?? withPoster[0])?.posterUrl || null;
	}

	/** What the three poster searches share: the cleaned name, IMDb id, release year and media kind. */
	private posterQuery(title: HoardTitle) {
		return {
			name: this.cleanTitleForSearch(title.title),
			imdbId: this.extractImdbId(title.externalLink),
			year: this.getReleaseYear(title),
			kind: this.resolveMediaKind(title),
		};
	}

	private async fetchTmdbPoster(title: HoardTitle, settings: HoardPluginSettings): Promise<string | null> {
		const { name, imdbId, year, kind } = this.posterQuery(title);
		const headers = { Authorization: `Bearer ${settings.tmdbApiKey}` };
		const q = encodeURIComponent(name);
		// 1. most precise: resolve by IMDb id directly; no poster on the exact match falls through to a search
		if (imdbId) {
			const data = await this.fetchJson(`${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, headers);
			const hit = at(data, 'movie_results', 0) ?? at(data, 'tv_results', 0);
			const path = readOptionalString(at(hit, 'poster_path'));
			if (path) return `${TMDB_IMG_BASE}${path}`;
		}
		// 2. type-aware search with year preference; 3. no type signal: untyped multi-search
		if (kind !== null) {
			const data = await this.fetchJson(`${TMDB_BASE}/search/${kind}?query=${q}&page=1`, headers);
			const path = this.pickTmdbPoster(at(data, 'results'), year);
			return path ? `${TMDB_IMG_BASE}${path}` : null;
		}
		const data = await this.fetchJson(`${TMDB_BASE}/search/multi?query=${q}&page=1`, headers);
		const path = readOptionalString(at(data, 'results', 0, 'poster_path'));
		return path ? `${TMDB_IMG_BASE}${path}` : null;
	}

	private async fetchOmdbPoster(title: HoardTitle, settings: HoardPluginSettings): Promise<string | null> {
		const { name, imdbId, year, kind } = this.posterQuery(title);
		const key = encodeURIComponent(settings.omdbApiKey);
		const posterAt = async (url: string): Promise<string | null> => {
			const poster = readString(at(await this.fetchJson(url), 'Poster'));
			return httpsOrEmpty(poster) ? poster : null;
		};
		// 1. most precise: resolve by IMDb id directly; no poster on the exact match falls through to a search
		if (imdbId) {
			const poster = await posterAt(`${OMDB_BASE}/?i=${encodeURIComponent(imdbId)}&apikey=${key}`);
			if (poster) return poster;
		}
		const base = `${OMDB_BASE}/?t=${encodeURIComponent(name)}&apikey=${key}`;
		// 2. type-aware search, preferring the matching year; 3. no type signal: untyped lookup
		if (kind === null) return posterAt(base);
		const typed = `${base}&type=${kind === 'movie' ? 'movie' : 'series'}`;
		return (year !== null && (await posterAt(`${typed}&y=${year}`))) || posterAt(typed);
	}

	/** throw:false + the shared classifier, so processQueue can tell a real failure from "no poster". */
	private fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
		return this.request({ url, headers });
	}

	private postJson(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown> {
		return this.request(jsonPost(url, body, headers));
	}

	private request(params: RequestUrlParam): Promise<unknown> {
		return requestVia(this.jikan(), params);
	}
}

function jikanCover(jpg: unknown): string | null {
	return httpsOrEmpty(readString(at(jpg, 'large_image_url')) || readString(at(jpg, 'image_url'))) || null;
}

function cinemetaKinds(kind: 'movie' | 'tv' | null): Array<'movie' | 'series'> {
	if (kind === null) return ['series', 'movie'];
	return [kind === 'tv' ? 'series' : 'movie'];
}
