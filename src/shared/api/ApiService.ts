import { requestUrl } from 'obsidian';
import type { RequestUrlParam } from 'obsidian';
import { httpsOrEmpty } from './httpsUrl';
import type { MediaSource } from './apiSources';
import { TENRAI_BASE, type JikanEndpoint } from './jikanBase';
import {
	ApiError, apiLabel, httpError, lookupOfError, rethrowAuth, type ApiErrorReason, type ApiSource,
} from './apiError';
import type { AnimeSearchResult, HoardTitle, MediaSearchResult, Season, TmdbCollectionDetail, TmdbCollectionRef } from '../../modules/watchlist/exports';
import { cinemetaMetaUrl, cinemetaSearchUrl, mapCinemetaMeta, explicitMediaKind, mapCinemetaSearch, type CinemetaKind } from './cinemetaApi';
import { mapOpenLibrarySearch, mapOpenLibraryWork, openLibrarySearchUrl, openLibraryWorkUrl } from './openLibraryApi';
import { mapSteamStoreSearch, steamDetailsToGameDetails, steamLibraryCover, steamStoreSearchUrl } from './steamStoreApi';
import { imdbIdFromLink } from '../domain/imdb';
import { normalizeCreditsForStore } from './credits';
import type { EntryCache } from '../storage/storageTypes';
import { at, readBoolean, readList, readNumber, readOptionalNumber, readOptionalString, readRecord, readString, readStringList } from '../domain/read';
import { isRecord } from '../domain/sharedHelpers';
import { attempt, errorMessage, firstFound, found, FAILED, NOT_FOUND, NO_KEY, type LookupResult, type LookupSource } from './lookup';

export { apiErrorMessage, apiErrorShort, lookupOfError } from './apiError';
export type { ApiSource } from './apiError';

export type Airing = NonNullable<EntryCache['airing']>;

const OMDB_BASE = 'https://www.omdbapi.com';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ANILIST_RATE_LIMIT_MS = 700;
const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
const RAWG_BASE = 'https://api.rawg.io/api';
const IGDB_BASE = 'https://api.igdb.com/v4';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const JIKAN_RATE_LIMIT_MS = 400;
const CINEMETA_HOST = 'https://v3-cinemeta.strem.io';
const OPEN_LIBRARY_HOST = 'https://openlibrary.org';
const OPEN_LIBRARY_COVERS_HOST = 'https://covers.openlibrary.org';
const STEAM_STORE_SEARCH = 'https://store.steampowered.com/api/storesearch';
const API_TIMEOUT_MS = 8000;
/** Google Books cover sizes, largest first. */
const GOOGLE_COVER_SIZES = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail'];

/** Add-flow search: 9 results per modal page, 3 pages. */
export const SEARCH_PAGE_SIZE = 9;
const SEARCH_MAX_PAGES = 3;
export const SEARCH_RESULT_LIMIT = SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES;
/** Fixed upstream page sizes; the fetch loops page until they reach the cap. */
const TMDB_PAGE_SIZE = 20;
const OMDB_PAGE_SIZE = 10;
const JIKAN_PAGE_SIZE = 25;

function nonEmptySeasons(seasons: Season[] | undefined): Season[] | null {
	return seasons && seasons.length > 0 ? seasons : null;
}

/** The list's entries that are records; anything else in a wrong-typed list is dropped. */
function recordsOf(v: unknown): Record<string, unknown>[] {
	return readList(v, (item) => (isRecord(item) ? item : undefined));
}

/** '' unless the input is a plain 4-digit year. Guards every provider's year filter. */
function searchYear(year: string | undefined): string {
	return year?.trim().match(/^\d{4}$/)?.[0] ?? '';
}

/** Canonical YouTube watch URL from a raw video id. */
function youtubeWatchUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * A YouTube video id from any shape providers hand back — `watch?v=ID`, `youtu.be/ID`
 * or `/embed/ID` (Jikan often ships only the embed URL). '' when none match.
 */
function extractYoutubeId(url: string | null | undefined): string {
	if (!url) return '';
	const m = url.match(/(?:[?&]v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
	return m?.[1] ?? '';
}

/** AniList `trailer { id site }` → watch URL; '' when absent, not YouTube, or malformed. */
function anilistTrailerUrl(trailer: unknown): string {
	const id = readString(at(trailer, 'id'));
	return readString(at(trailer, 'site')) === 'youtube' && id ? youtubeWatchUrl(id) : '';
}

/** Jikan `trailer` object → watch URL; '' when absent or malformed. */
function jikanTrailerUrl(trailer: unknown): string {
	const id =
		readString(at(trailer, 'youtube_id')) ||
		extractYoutubeId(readString(at(trailer, 'url'))) ||
		extractYoutubeId(readString(at(trailer, 'embed_url')));
	return id ? youtubeWatchUrl(id) : '';
}

/**
 * Best trailer from a TMDB `videos.results`: an official YouTube Trailer first, then any
 * YouTube Trailer, then any Teaser. A watch URL, or '' when none qualifies.
 */
function tmdbTrailerUrl(videos: unknown): string {
	const yt = readList(videos, (v) => {
		const key = readString(at(v, 'key'));
		if (readString(at(v, 'site')) !== 'YouTube' || !key) return undefined;
		return { key, type: readString(at(v, 'type')), official: readBoolean(at(v, 'official')) };
	});
	const pick =
		yt.find((v) => v.type === 'Trailer' && v.official) ??
		yt.find((v) => v.type === 'Trailer') ??
		yt.find((v) => v.type === 'Teaser');
	return pick ? youtubeWatchUrl(pick.key) : '';
}

/**
 * Splits an OMDb comma-separated name string ("Director" / "Actors") into a normalized
 * stored list: trimmed names, empty when absent / 'N/A', so both APIs yield the
 * same shape.
 */
function omdbNamesToCredits(s: unknown): string[] {
	return normalizeCreditsForStore(readString(s).split(','));
}

/**
 * Director credits for an OMDb *series*: Director is 'N/A' there (it varies per episode),
 * so the creators — which OMDb puts in Writer — fill the stored director instead, with
 * role notes stripped. Falls back to Director.
 */
function omdbSeriesDirectorCredits(data: unknown): string[] {
	const writer = readString(at(data, 'Writer'));
	const raw = writer === 'N/A' ? [] : writer.split(',');
	const creators = normalizeCreditsForStore(raw.map((n) => n.replace(/\([^)]*\)/g, '')));
	return creators.length === 0 ? omdbNamesToCredits(at(data, 'Director')) : creators;
}

/**
 * Director credits for a TMDB *series*: `created_by` (series have no single director),
 * falling back to crew Director entries.
 */
function tmdbSeriesDirectorCredits(detail: unknown): string[] {
	const creators = normalizeCreditsForStore(readList(at(detail, 'created_by'), (c) => readOptionalString(at(c, 'name'))));
	return creators.length === 0 ? tmdbCreditsToStored(at(detail, 'credits')).director : creators;
}

/**
 * Maps a TMDB `credits` payload to the stored { director, cast }: crew entries with the
 * Director job, plus the billing-ordered cast — normalized and capped like OMDb's.
 */
function tmdbCreditsToStored(credits: unknown): { director: string[]; cast: string[] } {
	const director = readList(at(credits, 'crew'), (c) =>
		readString(at(c, 'job')) === 'Director' ? readOptionalString(at(c, 'name')) : undefined);
	const cast = readList(at(credits, 'cast'), (c) => readOptionalString(at(c, 'name')));
	return {
		director: normalizeCreditsForStore(director),
		cast: normalizeCreditsForStore(cast),
	};
}

/** The OMDb detail request for an IMDb id. */
function omdbDetailUrl(imdbId: string, apiKey: string): string {
	return `${OMDB_BASE}/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
}

/** OMDb "DD Mon YYYY" (e.g. "08 Feb 2026") → YYYY-MM-DD. The input unchanged when it doesn't match (e.g. year-only "2026"). */
function parseOmdbDate(dateStr: string): string {
	const MONTHS: Record<string, string> = {
		Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
		Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
	};
	const m = dateStr.match(/^(\d{2})\s+([A-Za-z]{3})\s+(\d{4})$/);
	const mon = m?.[2] ? MONTHS[m[2]] : undefined;
	return m && mon ? `${m[3]}-${mon}-${m[1]}` : dateStr;
}

/** Release date of an OMDb detail record: `Released`, else `Year`, in the stored format. */
function omdbReleased(data: Record<string, unknown>): string {
	return readOptionalString(data.Released) ?? readString(data.Year);
}

/** One OMDb search hit as an add-flow row. */
function omdbSearchRow(item: Record<string, unknown>, type: 'movie' | 'series'): MediaSearchResult {
	const imdbId = readString(item.imdbID);
	return {
		imdbId,
		title: readString(item.Title),
		mediaType: type === 'movie' ? 'movie' : 'tv',
		// 0 like TMDB — the result card prints the media type instead of "1 eps".
		// The real count comes from the detail call on select.
		episodes: 0,
		episodeDuration: 0,
		// year only. OMDb search has no day/month; a faked 01-01 reads like a real date.
		// series Year is a range ("2008–2013", "2025–") — keep the start year only
		releaseDate: /^(\d{4})/.exec(readString(item.Year))?.[1] ?? '',
		url: `https://www.imdb.com/title/${imdbId}`,
		seasons: [],
		posterUrl: httpsOrEmpty(readString(item.Poster)) || undefined,
	};
}

/** One TMDB search hit as an add-flow row. */
function tmdbSearchRow(item: Record<string, unknown>, type: 'movie' | 'series'): MediaSearchResult {
	const poster = readOptionalString(item.poster_path);
	return {
		imdbId: String(readNumber(item.id)),
		title: readOptionalString(item.title) ?? readString(item.name),
		mediaType: type === 'movie' ? 'movie' : 'tv',
		episodes: 0,
		episodeDuration: 0,
		releaseDate: readOptionalString(item.release_date) ?? readString(item.first_air_date),
		url: '',
		seasons: [],
		posterUrl: poster ? `https://image.tmdb.org/t/p/w342${poster}` : undefined,
	};
}

/** A TMDB tv `seasons` list as consecutive seasons, specials (season 0) left out. */
function tmdbSeasons(v: unknown): Season[] {
	const raw = readList(v, (s) => {
		const number = readOptionalNumber(at(s, 'season_number'));
		if (!isRecord(s) || number === 0) return undefined;
		return { name: readString(at(s, 'name')) || `Season ${number ?? 1}`, episodes: readNumber(at(s, 'episode_count')) };
	});
	let offset = 0;
	return raw.map((s) => {
		const season: Season = { ...s, offset };
		offset += s.episodes;
		return season;
	});
}

/** A TMDB collection, or null when the payload names none. */
function tmdbCollectionDetail(data: unknown): TmdbCollectionDetail | null {
	const id = readOptionalNumber(at(data, 'id'));
	if (!id) return null;
	return {
		id,
		name: readString(at(data, 'name')),
		overview: readString(at(data, 'overview')),
		poster_path: readOptionalString(at(data, 'poster_path')) ?? null,
		parts: readList(at(data, 'parts'), (p) => {
			const partId = readOptionalNumber(at(p, 'id'));
			if (partId === undefined) return undefined;
			return {
				id: partId,
				title: readString(at(p, 'title')),
				release_date: readString(at(p, 'release_date')),
				poster_path: readOptionalString(at(p, 'poster_path')) ?? null,
				overview: readString(at(p, 'overview')),
			};
		}),
	};
}

/** A source's community rating and vote count. */
type CommunityScore = { rating: number; votes: number };
type CommunityRating = CommunityScore & { source: 'mal' | 'anilist' | 'imdb' | 'tmdb' };

/** The score, or null when the source reports neither a rating nor votes. */
function scoreOf(rating: number, votes: number): CommunityScore | null {
	return rating || votes ? { rating, votes } : null;
}

/** OMDb numbers arrive as strings ("1,234,567", "8.1", "N/A"); 0 when unreadable. */
function parseOmdbVotes(s: string): number {
	const n = parseInt(s.replace(/,/g, ''), 10);
	return isNaN(n) ? 0 : n;
}

function parseOmdbRating(s: string): number {
	const n = parseFloat(s);
	return isNaN(n) ? 0 : n;
}

/** A rating lookup that never throws: a failed request is no rating. */
async function quietly<T>(load: () => Promise<T | null>): Promise<T | null> {
	try {
		return await load();
	} catch {
		return null;
	}
}

/** anime or movie group of a title: the caller's pick, else from the stored type; '' when neither says. */
function mediaGroupOf(title: Pick<HoardTitle, 'type'>, apiGroup: 'anime' | 'movie' | ''): 'anime' | 'movie' | '' {
	if (apiGroup) return apiGroup;
	if (title.type === 'Anime') return 'anime';
	return ['Movie', 'TV Show', 'TvShow'].includes(title.type) ? 'movie' : '';
}

/** TMDB company/network names, normalized for storage. */
function tmdbCompanyNames(...lists: unknown[]): string[] {
	return normalizeCreditsForStore(lists.flatMap((list) => readList(list, (c) => readOptionalString(at(c, 'name')))));
}

/** What a credits lookup found: both lists normalized for storage. */
export interface CreditsLookup { director: string[]; cast: string[] }

/** What a studio lookup found, plus the TMDB id it resolved through, for the caller to cache. */
export interface StudioLookup { studio: string[]; tmdbId?: number; tmdbMediaType?: 'movie' | 'tv' }

/** The credits, or null when there are none (a lookup that came back empty found nothing). */
function creditsOf(credits: CreditsLookup): CreditsLookup | null {
	return credits.director.length === 0 && credits.cast.length === 0 ? null : credits;
}

/** The studio, or null when there is none. */
function studioOf(names: unknown): StudioLookup | null {
	const studio = normalizeCreditsForStore(names);
	return studio.length === 0 ? null : { studio };
}

/** One row in the Add-game search results (both RAWG and IGDB map to this). */
export interface GameSearchResult {
	source: 'rawg' | 'igdb' | 'steam';
	/** RAWG, IGDB or Steam numeric id — meaningful only with `source`. */
	id: number;
	title: string;
	/** YYYY-MM-DD, or '' when the API has no date. */
	releaseDate: string;
	coverUrl: string;
	platforms: string[];
	/** The game's page on the source site (rawg.io / igdb.com). */
	url: string;
}

/** Full detail payload for a selected game (the add-time autofill). */
export interface GameDetailsResult extends GameSearchResult {
	developer: string;
	publisher: string;
	singleplayer: boolean;
	coop: boolean;
	multiplayer: boolean;
	/** Store page URL, Steam → GOG → Epic priority; '' when none. */
	storeUrl: string;
}

// RAWG store ids (stable, documented): 1 Steam, 5 GOG, 11 Epic Games.
const RAWG_STORE_PRIORITY = [1, 5, 11];

/** A game record the lists can show: a numeric id and a non-empty name. */
function hasIdAndName(g: Record<string, unknown>): boolean {
	return typeof g.id === 'number' && readString(g.name) !== '';
}

/** The non-empty `name`s of a list of records. */
function namesOf(v: unknown): string[] {
	return recordsOf(v).map((r) => readString(r.name)).filter((n) => n !== '');
}

/** Store page URL by RAWG_STORE_PRIORITY, else the first https store link; '' when none. */
function rawgStoreUrl(stores: unknown): string {
	const links = recordsOf(at(stores, 'results')).filter((s) => httpsOrEmpty(readString(s.url)) !== '');
	const preferred = RAWG_STORE_PRIORITY.map((storeId) => links.find((s) => s.store_id === storeId)).find((s) => s !== undefined);
	return readString((preferred ?? links[0])?.url);
}

/** RAWG (english) tag slugs meaning co-op / versus multiplayer. */
const RAWG_COOP_TAGS = ['co-op', 'online-co-op', 'local-co-op', 'split-screen', 'cooperative'];
const RAWG_MULTIPLAYER_TAGS = ['multiplayer', 'online-multiplayer', 'massively-multiplayer', 'pvp'];

/** Store domains in pick order for the IGDB `websites` list (Steam → GOG → Epic). */
const IGDB_STORE_DOMAINS = ['store.steampowered.com', 'gog.com', 'epicgames.com'];

// Steam

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_BASE = 'https://store.steampowered.com/api';

/** SteamID64 or vanity name out of whatever the user pasted: the id itself, a profile URL of either shape, or a bare vanity. */
function parseSteamInput(raw: string): { id: string; vanity: string } {
	if (/^\d{17}$/.test(raw)) return { id: raw, vanity: '' };
	const profile = /steamcommunity\.com\/profiles\/(\d{17})/.exec(raw)?.[1];
	if (profile) return { id: profile, vanity: '' };
	return { id: '', vanity: /steamcommunity\.com\/id\/([^/?#]+)/.exec(raw)?.[1] ?? raw };
}

/** One entry of GetOwnedGames; undefined when it has no numeric appid. */
function steamOwnedGame(g: unknown): SteamOwnedGame | undefined {
	const appId = readOptionalNumber(at(g, 'appid'));
	if (appId === undefined) return undefined;
	const lastPlayed = readNumber(at(g, 'rtime_last_played'));
	return {
		appId: String(appId),
		name: readString(at(g, 'name')),
		playtimeMinutes: readNumber(at(g, 'playtime_forever')),
		lastPlayed: lastPlayed ? new Date(lastPlayed * 1000).toISOString() : null,
	};
}

/** Storefront category ids (stable): 2 Single-player, 1 Multi-player, 9/38/39 co-op. */
const STEAM_CAT_SINGLEPLAYER = 2;
const STEAM_CAT_MULTIPLAYER = 1;
const STEAM_COOP_CATS = new Set([9, 38, 39]);

/** Why a library fetch produced no games — drives the message the user sees. */
export type SteamFailureReason = 'ok' | 'missing' | 'badKey' | 'private' | 'empty' | 'network';

export interface SteamOwnedGame {
	appId: string;
	name: string;
	playtimeMinutes: number;
	/** ISO timestamp, or null when Steam reports no last-played time. */
	lastPlayed: string | null;
}

export interface SteamLibraryResult {
	ok: boolean;
	reason: SteamFailureReason;
	games: SteamOwnedGame[];
}

/** Storefront metadata, already mapped onto the plugin's own field names. */
export interface SteamAppDetails {
	name: string;
	developer: string;
	publisher: string;
	genres: string[];
	releaseDate: string | null;
	coverUrl: string;
	storeUrl: string;
	singleplayer: boolean;
	coop: boolean;
	multiplayer: boolean;
}

/** IGDB co-op game_modes names (shared/local play, not versus). */
const IGDB_COOP_MODES = new Set([
	'Co-operative',
	'Split screen',
]);

/** IGDB multiplayer game_modes names (single player and co-op are their own). */
const IGDB_MULTIPLAYER_MODES = new Set([
	'Multiplayer',
	'Massively Multiplayer Online (MMO)',
	'Battle Royale',
]);

export interface BookSearchResult {
	title: string;
	author: string;
	year: number;
	totalPages: number;
	coverUrl: string;
	googleBooksId: string;
	openLibraryId: string;
	releaseDate: string;
	url: string;
}

export interface MangaSearchResult {
	malId: number;
	title: string;
	author: string;
	year: number;
	totalChapters: number;
	totalVolumes: number;
	coverUrl: string;
	releaseDate: string;
	url: string;
}

/**
 * Source from the request URL — every base is a distinct host, so no call site has to say. The
 * Jikan base is user-configurable, so callers pass the one they request against.
 */
export function apiSourceFromUrl(url: string, jikanBase: string): ApiSource {
	const prefixes: Array<[string, ApiSource]> = [
		[TMDB_BASE, 'tmdb'],
		[OMDB_BASE, 'omdb'],
		[jikanBase, 'jikan'],
		[ANILIST_ENDPOINT, 'anilist'],
		[GOOGLE_BOOKS_BASE, 'googleBooks'],
		[RAWG_BASE, 'rawg'],
		[IGDB_BASE, 'igdb'],
		[TWITCH_TOKEN_URL, 'twitch'],
		[CINEMETA_HOST, 'cinemeta'],
		[OPEN_LIBRARY_HOST, 'openLibrary'],
		[OPEN_LIBRARY_COVERS_HOST, 'openLibrary'],
		[STEAM_STORE_SEARCH, 'steamStore'],
	];
	return prefixes.find(([prefix]) => url.startsWith(prefix))?.[1] ?? 'unknown';
}

/** One source per anime id the title has, the preferred API first; a title with neither id has nothing to ask. */
function animeSources<T>(
	title: Pick<HoardTitle, 'anilistId' | 'malId'>,
	preferred: 'jikan' | 'anilist',
	anilist: (anilistId: number) => LookupSource<T>,
	jikan: (malId: number) => LookupSource<T>,
): LookupSource<T>[] {
	const { anilistId, malId } = title;
	const sources: LookupSource<T>[] = [];
	if (anilistId !== undefined && anilistId > 0) sources.push(anilist(anilistId));
	if (malId !== undefined && malId > 0) sources.push(jikan(malId));
	if (preferred === 'jikan') sources.reverse();
	return sources.length > 0 ? sources : [() => Promise.resolve(NOT_FOUND)];
}

/** Status check + JSON parse for a throw:false response. Throws ApiError on either failure. */
function readApiResponse(
	source: ApiSource,
	r: { status: number; text: string; json: unknown },
	credentialSent = false,
): unknown {
	if (r.status < 200 || r.status >= 300) throw httpError(source, r.status, r.text, credentialSent);
	try {
		return r.json;
	} catch {
		throw new ApiError(source, 'parse', `${apiLabel(source)} returned a non-JSON body`);
	}
}

/**
 * OMDb can answer 200 with `{"Response":"False","Error":"Invalid API key!"}`. Only key and quota
 * problems are real errors here — "Movie not found!" is an ordinary empty result.
 */
function assertOmdbOk(data: unknown): void {
	if (readString(at(data, 'Response')) !== 'False') return;
	const err = readString(at(data, 'Error'));
	if (/limit/i.test(err)) throw new ApiError('omdb', 'rate-limited', err);
	if (/key/i.test(err)) throw new ApiError('omdb', 'auth', err);
}

/** Runs `work` against the shared API timeout; the timer is cleared either way. */
async function withTimeout<T>(work: () => Promise<T>, timedOut: () => Error): Promise<T> {
	let timer: number | null = null;
	const timeout = new Promise<never>((_, reject) => {
		timer = window.setTimeout(() => reject(timedOut()), API_TIMEOUT_MS);
	});
	try {
		return await Promise.race([work(), timeout]);
	} finally {
		if (timer !== null) window.clearTimeout(timer);
	}
}

/**
 * One request with the shared timeout and error classifier; every ApiError of a request comes
 * from here. throw:false so the status survives: requestUrl's default collapses every 4xx into one
 * opaque Error, which is why a rejected key used to look identical to "no results". `check`
 * inspects a parsed 200 body (GraphQL errors, a token response without a token);
 * `credentialSent` says the request carried a login for a service that needs none.
 */
async function requestJson(
	source: ApiSource,
	params: RequestUrlParam,
	check?: (data: unknown) => void,
	credentialSent = false,
): Promise<unknown> {
	try {
		return await withTimeout(
			() => requestUrl({ ...params, throw: false }).then((r) => {
				const data = readApiResponse(source, r, credentialSent);
				check?.(data);
				return data;
			}),
			() => new ApiError(source, 'network', 'Request timed out'),
		);
	} catch (err) {
		if (err instanceof ApiError) throw err;
		throw new ApiError(source, 'network', errorMessage(err) || 'Network error');
	}
}

/** requestJson for any API; requests to the Jikan endpoint carry its headers (Basic auth). */
export function requestVia(
	jikan: JikanEndpoint,
	params: RequestUrlParam,
	check?: (source: ApiSource, data: unknown) => void,
): Promise<unknown> {
	const source = apiSourceFromUrl(params.url, jikan.base);
	const sent = source === 'jikan' ? { ...params, headers: { ...jikan.headers, ...params.headers } } : params;
	// keyless Jikan reads 401/403 as an outage; with a login sent, it is the login being rejected
	const credentialSent = source === 'jikan' && !!sent.headers?.['Authorization'];
	return requestJson(source, sent, check && ((data) => check(source, data)), credentialSent);
}

/** Request params for a JSON POST. */
export function jsonPost(url: string, body: unknown, headers?: Record<string, string>): RequestUrlParam {
	return {
		url,
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
		body: JSON.stringify(body),
	};
}

/** A 200 without a token is Twitch refusing the client credentials. */
function assertTokenIssued(data: unknown): void {
	// no body at all is a broken answer, not a refusal
	if (!isRecord(data)) throw new ApiError('twitch', 'network', 'Twitch returned no token response');
	if (!readString(at(data, 'access_token'))) throw new ApiError('twitch', 'auth', 'Twitch returned no access token');
}

/** GraphQL reports failures in a 200 body — AniList rate limits arrive this way. */
function assertNoGraphqlErrors(source: ApiSource, data: unknown): void {
	const errors = at(data, 'errors');
	if (!Array.isArray(errors) || errors.length === 0) return;
	const message = readString(at(errors, 0, 'message')) || 'Request rejected';
	const reason: ApiErrorReason = /rate limit|too many/i.test(message) ? 'rate-limited' : 'http';
	throw new ApiError(source, reason, message, { providerMessage: message });
}

export class ApiService {
	private omdbApiKey: string;
	private tmdbApiKey: string;
	private googleBooksApiKey: string;
	private rawgApiKey: string;
	private igdbClientId: string;
	private igdbClientSecret: string;
	private steamApiKey = '';
	private steamId = '';
	/** Cached IGDB (Twitch) app access token + its absolute expiry timestamp. */
	private igdbToken = '';
	private igdbTokenExpiry = 0;
	private anilistLastRequest = 0;
	private anilistQueue: Promise<void> = Promise.resolve();
	private jikanLastRequest = 0;
	private jikanQueue: Promise<void> = Promise.resolve();
	/** Resolved Jikan-v4-compatible endpoint (Tenrai unless the user set another). */
	private jikan: JikanEndpoint;

	private throttleJikan<T>(task: () => Promise<T>): Promise<T> {
		const run = async (): Promise<T> => {
			const now = Date.now();
			const gap = now - this.jikanLastRequest;
			if (gap < JIKAN_RATE_LIMIT_MS) {
				await new Promise<void>((r) => window.setTimeout(r, JIKAN_RATE_LIMIT_MS - gap));
			}
			this.jikanLastRequest = Date.now();
			return task();
		};
		const next = this.jikanQueue.then(run, run);
		this.jikanQueue = next.then(() => undefined, () => undefined);
		return next;
	}

	constructor(
		omdbApiKey: string,
		tmdbApiKey = '',
		googleBooksApiKey = '',
		rawgApiKey = '',
		igdbClientId = '',
		igdbClientSecret = '',
		steamApiKey = '',
		steamId = '',
		jikan: JikanEndpoint = { base: TENRAI_BASE, headers: {} },
	) {
		this.omdbApiKey = omdbApiKey;
		this.tmdbApiKey = tmdbApiKey;
		this.googleBooksApiKey = googleBooksApiKey;
		this.rawgApiKey = rawgApiKey;
		this.igdbClientId = igdbClientId;
		this.igdbClientSecret = igdbClientSecret;
		this.steamApiKey = steamApiKey;
		this.steamId = steamId;
		this.jikan = jikan;
	}

	setJikanEndpoint(jikan: JikanEndpoint): void {
		this.jikan = jikan;
	}

	/** Settings Test: the endpoint answers /anime/1 with MAL id 1. Throws ApiError. */
	async pingJikan(): Promise<boolean> {
		const url = `${this.jikan.base}/anime/1`;
		const res = await this.throttleJikan(() => this.fetchWithTimeout(url));
		return at(res, 'data', 'mal_id') === 1;
	}

	setOmdbKey(key: string): void {
		this.omdbApiKey = key;
	}

	setTmdbKey(key: string): void {
		this.tmdbApiKey = key;
	}

	setGoogleBooksKey(key: string): void {
		this.googleBooksApiKey = key;
	}

	hasGoogleBooksKey(): boolean {
		return this.googleBooksApiKey.trim().length > 0;
	}

	setRawgKey(key: string): void {
		this.rawgApiKey = key;
	}

	setIgdbCredentials(clientId: string, clientSecret: string): void {
		// Invalidate the cached token whenever the credentials change.
		if (clientId !== this.igdbClientId || clientSecret !== this.igdbClientSecret) {
			this.igdbToken = '';
			this.igdbTokenExpiry = 0;
		}
		this.igdbClientId = clientId;
		this.igdbClientSecret = clientSecret;
	}

	hasRawgKey(): boolean {
		return this.rawgApiKey.trim().length > 0;
	}

	hasIgdbCredentials(): boolean {
		return this.igdbClientId.trim().length > 0 && this.igdbClientSecret.trim().length > 0;
	}

	private tmdbHeaders(): Record<string, string> {
		return { 'Authorization': `Bearer ${this.tmdbApiKey}` };
	}

	/** The TMDB movie and tv ids an IMDb id resolves to (the first hit of each kind). Throws when the request fails. */
	private async tmdbFindIds(imdbId: string): Promise<{ movie?: number; tv?: number }> {
		const hits = await this.fetchWithTimeout(`${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, this.tmdbHeaders());
		return {
			movie: readOptionalNumber(at(hits, 'movie_results', 0, 'id')),
			tv: readOptionalNumber(at(hits, 'tv_results', 0, 'id')),
		};
	}

	private request(params: RequestUrlParam, check?: (source: ApiSource, data: unknown) => void): Promise<unknown> {
		return requestVia(this.jikan, params, check);
	}

	private fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<unknown> {
		return this.request({ url, headers });
	}

	private postJsonWithTimeout(url: string, body: unknown, headers?: Record<string, string>): Promise<unknown> {
		return this.request(jsonPost(url, body, headers), assertNoGraphqlErrors);
	}

	// AniList (GraphQL)

	/** Serializes AniList requests with a minimum gap of ANILIST_RATE_LIMIT_MS. */
	private throttleAniList<T>(task: () => Promise<T>): Promise<T> {
		const run = async (): Promise<T> => {
			const now = Date.now();
			const gap = now - this.anilistLastRequest;
			if (gap < ANILIST_RATE_LIMIT_MS) {
				await new Promise<void>((r) => window.setTimeout(r, ANILIST_RATE_LIMIT_MS - gap));
			}
			this.anilistLastRequest = Date.now();
			return task();
		};
		const next = this.anilistQueue.then(run, run);
		this.anilistQueue = next.then(() => undefined, () => undefined);
		return next;
	}

	private stripHtml(s: string): string {
		return s
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<[^>]+>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#039;/g, "'")
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.trim();
	}

	private formatAniListDate(d: unknown): string {
		const year = readOptionalNumber(at(d, 'year'));
		if (!year) return '';
		const mm = String(readOptionalNumber(at(d, 'month')) ?? 1).padStart(2, '0');
		const dd = String(readOptionalNumber(at(d, 'day')) ?? 1).padStart(2, '0');
		return `${String(year)}-${mm}-${dd}`;
	}

	private mapAniListMedia(media: unknown): AnimeSearchResult {
		const id = readNumber(at(media, 'id'));
		const title = at(media, 'title');
		const episodes = readNumber(at(media, 'episodes'));
		const seasons: Season[] =
			episodes > 0 ? [{ name: 'Season 1', episodes, offset: 0 }] : [];
		const description = readString(at(media, 'description'));
		const genres = readStringList(at(media, 'genres'));
		return {
			malId: 0,
			anilistId: id,
			title: readOptionalString(at(title, 'english')) ?? readOptionalString(at(title, 'romaji')) ?? readString(at(title, 'native')),
			episodes,
			duration: readOptionalNumber(at(media, 'duration')) ?? 24,
			releaseDate: this.formatAniListDate(at(media, 'startDate')),
			url: `https://anilist.co/anime/${id}`,
			seasons,
			description: description ? this.stripHtml(description) : '',
			averageScore: readOptionalNumber(at(media, 'averageScore')),
			genres: genres.length > 0 ? genres : undefined,
			posterUrl: httpsOrEmpty(readOptionalString(at(media, 'coverImage', 'large')) ?? readOptionalString(at(media, 'coverImage', 'medium'))) || undefined,
			trailerUrl: anilistTrailerUrl(at(media, 'trailer')) || undefined,
		};
	}

	async searchAniList(query: string, year?: string): Promise<AnimeSearchResult[]> {
		// AniList rejects startDate_like: null, so the arg is only declared when a year is set
		const yr = searchYear(year);
		const gql = `
			query ($search: String${yr ? ', $year: String' : ''}) {
				Page(page: 1, perPage: ${SEARCH_RESULT_LIMIT}) {
					media(search: $search, type: ANIME${yr ? ', startDate_like: $year' : ''}) {
						id
						title { romaji english native }
						episodes
						duration
						status
						season
						seasonYear
						startDate { year month day }
						averageScore
						popularity
						coverImage { large medium }
						description
						genres
						trailer { id site }
					}
				}
			}
		`;
		const variables = yr ? { search: query, year: `${yr}%` } : { search: query };
		// throws ApiError — the caller renders the reason instead of an empty result list
		const res = await this.throttleAniList(() =>
			this.postJsonWithTimeout(ANILIST_ENDPOINT, { query: gql, variables }),
		);
		return recordsOf(at(res, 'data', 'Page', 'media')).map((m) => this.mapAniListMedia(m));
	}

	/** The AniList Media node for an id (null when AniList has none); failures throw, background checks tell them apart. */
	private async queryAniListById(anilistId: number): Promise<Record<string, unknown> | null> {
		const gql = `
			query ($id: Int) {
				Media(id: $id, type: ANIME) {
					id
					title { romaji english native }
					episodes
					duration
					status
					averageScore
					popularity
					coverImage { large }
					studios { edges { isMain node { name } } }
					trailer { id site }
					nextAiringEpisode {
						airingAt
						episode
						timeUntilAiring
					}
				}
			}
		`;
		const res = await this.throttleAniList(() =>
			this.postJsonWithTimeout(ANILIST_ENDPOINT, { query: gql, variables: { id: anilistId } }),
		);
		const media = at(res, 'data', 'Media');
		return isRecord(media) ? media : null;
	}

	// Jikan / MAL

	/**
	 * throws ApiError. `limit` defaults to one Jikan page; the add flow passes the full cap,
	 * which costs a second (throttled) request.
	 */
	async searchAnime(query: string, year?: string, limit = JIKAN_PAGE_SIZE): Promise<AnimeSearchResult[]> {
		// Jikan has no year param; a whole-year window is the equivalent
		const yr = searchYear(year);
		const base =
			`${this.jikan.base}/anime?q=${encodeURIComponent(query)}&limit=${JIKAN_PAGE_SIZE}&sfw=false` +
			(yr ? `&start_date=${yr}-01-01&end_date=${yr}-12-31` : '');
		const items: Record<string, unknown>[] = [];
		const maxPages = Math.ceil(limit / JIKAN_PAGE_SIZE);
		for (let page = 1; page <= maxPages; page++) {
			const data = await this.throttleJikan(() => this.fetchWithTimeout(`${base}&page=${page}`));
			items.push(...recordsOf(at(data, 'data')));
			if (items.length >= limit || !readBoolean(at(data, 'pagination', 'has_next_page'))) break;
		}
		return items.slice(0, limit).map((a) => this.mapJikanAnime(a));
	}

	private mapJikanAnime(anime: unknown): AnimeSearchResult {
		const durationMatch = (readOptionalString(at(anime, 'duration')) ?? '24 min per ep').match(/(\d+)\s*min/);
		const episodes = readNumber(at(anime, 'episodes'));
		const jpg = at(anime, 'images', 'jpg');
		return {
			malId: readNumber(at(anime, 'mal_id')),
			title: readOptionalString(at(anime, 'title_english')) ?? readString(at(anime, 'title')),
			episodes,
			duration: durationMatch?.[1] ? parseInt(durationMatch[1], 10) : 24,
			releaseDate: readString(at(anime, 'aired', 'from')).split('T')[0] ?? '',
			url: httpsOrEmpty(readString(at(anime, 'url'))),
			seasons: episodes > 0 ? [{ name: 'Season 1', episodes, offset: 0 }] : [],
			posterUrl: httpsOrEmpty(
				readOptionalString(at(jpg, 'large_image_url')) ?? readOptionalString(at(jpg, 'image_url')) ?? readOptionalString(at(jpg, 'small_image_url')),
			) || undefined,
			trailerUrl: jikanTrailerUrl(at(anime, 'trailer')) || undefined,
		};
	}

	// OMDb

	/** throws ApiError */
	async searchOmdb(query: string, type: 'movie' | 'series', year?: string): Promise<MediaSearchResult[]> {
		if (!this.omdbApiKey) throw new ApiError('omdb', 'no-key', 'OMDb API key not set');
		const yr = searchYear(year);
		const base =
			`${OMDB_BASE}/?s=${encodeURIComponent(query)}&type=${type}` +
			(yr ? `&y=${yr}` : '') +
			`&apikey=${encodeURIComponent(this.omdbApiKey)}`;
		const items: Record<string, unknown>[] = [];
		const maxPages = Math.ceil(SEARCH_RESULT_LIMIT / OMDB_PAGE_SIZE);
		for (let page = 1; page <= maxPages; page++) {
			const data = await this.fetchWithTimeout(`${base}&page=${page}`);
			assertOmdbOk(data);
			// past the last page OMDb answers Response:False, not an empty list
			if (readString(at(data, 'Response')) === 'False') break;
			const batch = recordsOf(at(data, 'Search'));
			items.push(...batch);
			const total = parseInt(readString(at(data, 'totalResults')), 10);
			if (items.length >= SEARCH_RESULT_LIMIT || batch.length < OMDB_PAGE_SIZE) break;
			if (Number.isFinite(total) && items.length >= total) break;
		}
		return items.slice(0, SEARCH_RESULT_LIMIT).map((item) => omdbSearchRow(item, type));
	}

	/** One OMDb detail record; null for "Response: False" or a record without an id. Key and quota problems throw. */
	private async fetchOmdbDetail(imdbId: string): Promise<Record<string, unknown> | null> {
		const data = await this.fetchWithTimeout(omdbDetailUrl(imdbId, this.omdbApiKey));
		assertOmdbOk(data);
		const detail = readRecord(data);
		return readString(detail.Response) === 'False' || !readString(detail.imdbID) ? null : detail;
	}

	/**
	 * Runs `use` on the OMDb detail for an id. Null without a key, for a missing title and on a failed
	 * request; a rejected credential still throws (see rethrowAuth).
	 */
	private async withOmdbDetail<T>(imdbId: string, use: (data: Record<string, unknown>) => Promise<T | null> | T | null): Promise<T | null> {
		if (!this.omdbApiKey) return null;
		try {
			const data = await this.fetchOmdbDetail(imdbId);
			return data ? await use(data) : null;
		} catch (e) {
			rethrowAuth(e);
			return null;
		}
	}

	getOmdbMovieDetails(imdbId: string): Promise<MediaSearchResult | null> {
		return this.withOmdbDetail(imdbId, (data): MediaSearchResult => {
			const runtimeMin = parseInt(readString(data.Runtime).replace(/[^0-9]/g, ''), 10);
			const id = readString(data.imdbID);
			return {
				imdbId: id,
				title: readString(data.Title),
				mediaType: 'movie',
				episodes: 1,
				episodeDuration: isNaN(runtimeMin) ? 120 : runtimeMin,
				releaseDate: parseOmdbDate(omdbReleased(data)),
				url: `https://www.imdb.com/title/${id}`,
				seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
				director: omdbNamesToCredits(data.Director),
				cast: omdbNamesToCredits(data.Actors),
			};
		});
	}

	getOmdbTvDetails(imdbId: string): Promise<MediaSearchResult | null> {
		return this.withOmdbDetail(imdbId, async (data): Promise<MediaSearchResult> => {
			const totalSeasons = parseInt(readString(data.totalSeasons, '1'), 10) || 1;
			const seasons: Season[] = [];
			let offset = 0;

			for (let s = 1; s <= totalSeasons; s++) {
				const count = await this.getOmdbSeasonEpisodeCount(imdbId, s);
				if (count === null) break;
				seasons.push({ name: `Season ${s}`, episodes: count, offset });
				offset += count;
			}

			const id = readString(data.imdbID);
			return {
				imdbId: id,
				title: readString(data.Title),
				mediaType: 'tv',
				episodes: offset,
				episodeDuration: 45,
				releaseDate: parseOmdbDate(omdbReleased(data)),
				url: `https://www.imdb.com/title/${id}`,
				seasons,
				director: omdbSeriesDirectorCredits(data),
				cast: omdbNamesToCredits(data.Actors),
			};
		});
	}

	private async getOmdbSeasonEpisodeCount(imdbId: string, season: number): Promise<number | null> {
		const url = `${OMDB_BASE}/?i=${encodeURIComponent(imdbId)}&Season=${season}&apikey=${encodeURIComponent(this.omdbApiKey)}`;
		try {
			const data = await this.fetchWithTimeout(url);
			if (readString(at(data, 'Response')) === 'False') return null;
			const episodes = at(data, 'Episodes');
			return Array.isArray(episodes) ? episodes.length : 0;
		} catch {
			return null;
		}
	}

	// Jikan schedule

	async getAnimeScheduleByMalId(
		malId: number,
	): Promise<{ dayOfWeek: number; time: string } | null> {
		try {
			const url = `${this.jikan.base}/anime/${malId}`;
			const data = await this.fetchWithTimeout(url);
			const day = readOptionalString(at(data, 'data', 'broadcast', 'day'));
			const time = readOptionalString(at(data, 'data', 'broadcast', 'time'));
			if (!day || !time) return null;

			const dayMap: Record<string, number> = {
				Mondays: 1, Tuesdays: 2, Wednesdays: 3, Thursdays: 4,
				Fridays: 5, Saturdays: 6, Sundays: 0,
			};
			const dayOfWeek = dayMap[day];
			if (dayOfWeek === undefined) return null;
			return { dayOfWeek, time };
		} catch {
			return null;
		}
	}

	/** Trailer lookup for one anime (Jikan /anime/{mal_id}); a request failure is `failed`, not a missing trailer. */
	getJikanTrailerByMalId(malId: number): Promise<LookupResult<string>> {
		return attempt(async () => {
			const data = await this.throttleJikan(() => this.fetchWithTimeout(`${this.jikan.base}/anime/${malId}`));
			return jikanTrailerUrl(at(data, 'data', 'trailer')) || null;
		}, lookupOfError);
	}

	/** Fetches OMDb detail by raw IMDb ID, auto-detecting movie vs. TV. */
	getOmdbByImdbId(imdbId: string): Promise<MediaSearchResult | null> {
		return this.withOmdbDetail(imdbId, (data) =>
			readString(data.Type) === 'movie' ? this.getOmdbMovieDetails(imdbId) : this.getOmdbTvDetails(imdbId));
	}

	// TMDB

	/** throws ApiError */
	async searchTmdb(query: string, type: 'movie' | 'series', year?: string): Promise<MediaSearchResult[]> {
		if (!this.tmdbApiKey) throw new ApiError('tmdb', 'no-key', 'TMDB token not set');
		const endpoint = type === 'movie' ? 'movie' : 'tv';
		// TMDB matches `query` literally; a year typed into it ("Bachelor 2021") finds nothing
		const yr = searchYear(year);
		const yearKey = type === 'movie' ? 'primary_release_year' : 'first_air_date_year';
		const base =
			`${TMDB_BASE}/search/${endpoint}?query=${encodeURIComponent(query)}` +
			(yr ? `&${yearKey}=${yr}` : '');
		const items: Record<string, unknown>[] = [];
		const maxPages = Math.ceil(SEARCH_RESULT_LIMIT / TMDB_PAGE_SIZE);
		for (let page = 1; page <= maxPages; page++) {
			const data = await this.fetchWithTimeout(`${base}&page=${page}`, this.tmdbHeaders());
			// a row without a numeric id cannot be added
			items.push(...recordsOf(at(data, 'results')).filter((item) => readOptionalNumber(item.id) !== undefined));
			if (items.length >= SEARCH_RESULT_LIMIT || page >= readNumber(at(data, 'total_pages'), 1)) break;
		}
		return items.slice(0, SEARCH_RESULT_LIMIT).map((item) => tmdbSearchRow(item, type));
	}

	async getTmdbMovieDetails(tmdbId: string): Promise<MediaSearchResult | null> {
		if (!this.tmdbApiKey) return null;
		try {
			// append_to_response=videos,credits folds the trailer + credits lookups into the detail
			// call (no extra round-trips)
			const [detail, ext] = await Promise.all([
				this.fetchWithTimeout(`${TMDB_BASE}/movie/${tmdbId}?append_to_response=videos,credits`, this.tmdbHeaders()),
				this.fetchWithTimeout(`${TMDB_BASE}/movie/${tmdbId}/external_ids`, this.tmdbHeaders()),
			]);
			const imdbId = readOptionalString(at(ext, 'imdb_id')) ?? readString(at(detail, 'imdb_id'));
			return {
				imdbId: String(readNumber(at(detail, 'id'))),
				title: readString(at(detail, 'title')),
				mediaType: 'movie',
				episodes: 1,
				episodeDuration: readOptionalNumber(at(detail, 'runtime')) ?? 120,
				releaseDate: readString(at(detail, 'release_date')),
				url: imdbId ? `https://www.imdb.com/title/${imdbId}` : '',
				seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
				trailerUrl: tmdbTrailerUrl(at(detail, 'videos', 'results')) || undefined,
				studio: tmdbCompanyNames(at(detail, 'production_companies')),
				...tmdbCreditsToStored(at(detail, 'credits')),
			};
		} catch (e) {
			rethrowAuth(e);
			return null;
		}
	}

	async getTmdbTvDetails(tmdbId: string): Promise<MediaSearchResult | null> {
		if (!this.tmdbApiKey) return null;
		try {
			return await this.loadTmdbTvDetails(tmdbId);
		} catch (e) {
			rethrowAuth(e);
			return null;
		}
	}

	/** TMDB tv details; failures throw. */
	private async loadTmdbTvDetails(tmdbId: string): Promise<MediaSearchResult> {
		const [detail, ext] = await Promise.all([
			this.fetchWithTimeout(`${TMDB_BASE}/tv/${tmdbId}?append_to_response=videos,credits`, this.tmdbHeaders()),
			this.fetchWithTimeout(`${TMDB_BASE}/tv/${tmdbId}/external_ids`, this.tmdbHeaders()),
		]);
		const imdbId = readString(at(ext, 'imdb_id'));
		const seasons = tmdbSeasons(at(detail, 'seasons'));
		const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes, 0) || readNumber(at(detail, 'number_of_episodes'));

		return {
			imdbId: String(readNumber(at(detail, 'id'))),
			title: readString(at(detail, 'name')),
			mediaType: 'tv',
			episodes: totalEpisodes,
			episodeDuration: readOptionalNumber(at(detail, 'episode_run_time', 0)) ?? 45,
			releaseDate: readString(at(detail, 'first_air_date')),
			url: imdbId ? `https://www.imdb.com/title/${imdbId}` : '',
			seasons,
			trailerUrl: tmdbTrailerUrl(at(detail, 'videos', 'results')) || undefined,
			// networks lead — HBO/Netflix is the brand; production_companies is shells
			studio: tmdbCompanyNames(at(detail, 'networks'), at(detail, 'production_companies')),
			director: tmdbSeriesDirectorCredits(detail),
			cast: tmdbCreditsToStored(at(detail, 'credits')).cast,
		};
	}

	// Season refill (a note from another device, no cached seasons)

	/**
	 * Season list by identity, from the same sources the add flow uses: AniList/Jikan episode count
	 * (one season), TMDB tv details, or OMDb/TMDB for an IMDb link. notfound = movie, no source or
	 * no seasons there; transient = the request failed; nokey = the needed key is missing or rejected.
	 */
	async fetchSeasons(
		title: Pick<HoardTitle, 'anilistId' | 'malId' | 'tmdbId' | 'tmdbMediaType' | 'externalLink'>,
	): Promise<LookupResult<Season[]>> {
		const single = (episodes: number | null | undefined): LookupResult<Season[]> =>
			episodes ? found([{ name: 'Season 1', episodes, offset: 0 }]) : NOT_FOUND;
		const multi = (seasons: Season[] | undefined): LookupResult<Season[]> => {
			const nonEmpty = nonEmptySeasons(seasons);
			return nonEmpty ? found(nonEmpty) : NOT_FOUND;
		};
		try {
			if (title.anilistId !== undefined) return single(readOptionalNumber(at(await this.queryAniListById(title.anilistId), 'episodes')));
			if (title.malId !== undefined) {
				const url = `${this.jikan.base}/anime/${title.malId}`;
				const data = await this.throttleJikan(() => this.fetchWithTimeout(url));
				return single(readOptionalNumber(at(data, 'data', 'episodes')));
			}
			if (title.tmdbId !== undefined) {
				if (title.tmdbMediaType !== 'tv') return NOT_FOUND;
				if (!this.tmdbApiKey) return NO_KEY;
				return multi((await this.loadTmdbTvDetails(String(title.tmdbId))).seasons);
			}
			const imdbId = imdbIdFromLink(title.externalLink);
			if (!imdbId) return NOT_FOUND;
			if (!this.omdbApiKey && !this.tmdbApiKey) return NO_KEY;
			const full = this.omdbApiKey ? await this.getOmdbTvDetails(imdbId) : await this.getTmdbByImdbId(imdbId);
			// those lookups fold failures into null: retry soon rather than call it missing
			if (!full) return FAILED;
			return full.mediaType === 'tv' ? multi(full.seasons) : NOT_FOUND;
		} catch (err) {
			return lookupOfError(err);
		}
	}

	// Airing pointer (Upcoming)

	/**
	 * Next / last aired episode: AniList by `anilistId`, else TMDB tv by `tmdbId` (needs the key).
	 * notfound = no source or no such title; nothing is fetched without an id.
	 */
	async fetchAiring(title: Pick<HoardTitle, 'anilistId' | 'tmdbId' | 'tmdbMediaType'>): Promise<LookupResult<Airing>> {
		try {
			if (title.anilistId !== undefined) return await this.fetchAniListAiring(title.anilistId);
			if (title.tmdbId !== undefined && title.tmdbMediaType === 'tv') {
				if (!this.tmdbApiKey) return NO_KEY;
				return await this.fetchTmdbAiring(title.tmdbId);
			}
			return NOT_FOUND;
		} catch (err) {
			return lookupOfError(err);
		}
	}

	private async fetchAniListAiring(anilistId: number): Promise<LookupResult<Airing>> {
		const media = await this.queryAniListById(anilistId);
		if (!media) return NOT_FOUND;
		const airing: Airing = { refreshedAt: new Date().toISOString() };
		const nextEpisode = readOptionalNumber(at(media, 'nextAiringEpisode', 'episode'));
		const totalEpisodes = readNumber(media.episodes);
		if (nextEpisode !== undefined) {
			airing.nextEpisode = nextEpisode;
			const airingAt = readOptionalNumber(at(media, 'nextAiringEpisode', 'airingAt'));
			if (airingAt !== undefined) airing.nextAirDate = new Date(airingAt * 1000).toISOString();
			if (nextEpisode > 1) airing.lastEpisode = nextEpisode - 1;
		} else if (readString(media.status) === 'FINISHED' && totalEpisodes > 0) {
			airing.lastEpisode = totalEpisodes;
		}
		return found(airing);
	}

	private async fetchTmdbAiring(tmdbId: number): Promise<LookupResult<Airing>> {
		const detail = await this.fetchWithTimeout(`${TMDB_BASE}/tv/${tmdbId}`, this.tmdbHeaders());
		const airing: Airing = { refreshedAt: new Date().toISOString() };
		const nextEpisode = readOptionalNumber(at(detail, 'next_episode_to_air', 'episode_number'));
		if (nextEpisode !== undefined) {
			airing.nextEpisode = nextEpisode;
			const season = readOptionalNumber(at(detail, 'next_episode_to_air', 'season_number'));
			if (season !== undefined) airing.nextSeason = season;
			const airDate = readOptionalString(at(detail, 'next_episode_to_air', 'air_date'));
			if (airDate) airing.nextAirDate = airDate;
		}
		const lastEpisode = readOptionalNumber(at(detail, 'last_episode_to_air', 'episode_number'));
		if (lastEpisode !== undefined) {
			airing.lastEpisode = lastEpisode;
			const season = readOptionalNumber(at(detail, 'last_episode_to_air', 'season_number'));
			if (season !== undefined) airing.lastSeason = season;
		}
		return found(airing);
	}

	hasOmdbKey(): boolean {
		return this.omdbApiKey.trim().length > 0;
	}

	hasTmdbKey(): boolean {
		return this.tmdbApiKey.trim().length > 0;
	}

	// Studio / network

	/**
	 * Studio names for a title, plus the TMDB id it resolved through so the caller can cache it.
	 * notfound = the sources answered without a studio (or the title has no id to ask with);
	 * failed = a request failed; nokey = a movie without a TMDB key.
	 *
	 * OMDb is not a source — its Production field returns 'N/A' on movies and is absent on
	 * series, verified 2026-07-28.
	 */
	fetchStudio(
		title: HoardTitle,
		animeSource: 'jikan' | 'anilist',
		group: 'anime' | 'movie' | '',
	): Promise<LookupResult<StudioLookup>> {
		if (group === 'anime') return firstFound(this.animeStudioSources(title, animeSource));
		if (group !== 'movie') return Promise.resolve(NOT_FOUND);
		return this.tmdbStudio(title);
	}

	/** The studio source per anime id the title has: AniList's main studios, Jikan's studios. */
	private animeStudioSources(title: HoardTitle, animeSource: 'jikan' | 'anilist'): LookupSource<StudioLookup>[] {
		const anilist = (anilistId: number): LookupSource<StudioLookup> => () => attempt(async () => {
			const media = await this.queryAniListById(anilistId);
			const main = readList(at(media, 'studios', 'edges'), (e) =>
				readBoolean(at(e, 'isMain')) ? readOptionalString(at(e, 'node', 'name')) : undefined);
			return studioOf(main);
		}, lookupOfError);
		const jikan = (malId: number): LookupSource<StudioLookup> => () => attempt(async () => {
			const res = await this.throttleJikan(() => this.fetchWithTimeout(`${this.jikan.base}/anime/${malId}`));
			return studioOf(readList(at(res, 'data', 'studios'), (st) => readOptionalString(at(st, 'name'))));
		}, lookupOfError);
		return animeSources(title, animeSource, anilist, jikan);
	}

	/** TMDB company/network names: by the cached TMDB id, else through the IMDb id's /find. */
	private tmdbStudio(title: HoardTitle): Promise<LookupResult<StudioLookup>> {
		if (!this.tmdbApiKey) return Promise.resolve(NO_KEY);
		return attempt(async () => {
			if (title.tmdbId && title.tmdbMediaType) return this.tmdbStudioOf(title.tmdbMediaType, title.tmdbId);
			const imdbId = imdbIdFromLink(title.externalLink);
			if (!imdbId) return null;
			const { movie, tv } = await this.tmdbFindIds(imdbId);
			if (movie) return this.tmdbStudioOf('movie', movie, true);
			return tv ? this.tmdbStudioOf('tv', tv, true) : null;
		}, lookupOfError);
	}

	/** Studio of one TMDB record; `withId` also reports the id, for the caller to cache. */
	private async tmdbStudioOf(kind: 'movie' | 'tv', id: number, withId = false): Promise<StudioLookup | null> {
		const detail = await this.fetchWithTimeout(`${TMDB_BASE}/${kind}/${id}`, this.tmdbHeaders());
		const studio = kind === 'tv'
			? tmdbCompanyNames(at(detail, 'networks'), at(detail, 'production_companies')) // networks lead: HBO/Netflix is the brand
			: tmdbCompanyNames(at(detail, 'production_companies'));
		if (studio.length === 0) return null;
		return withId ? { studio, tmdbId: id, tmdbMediaType: kind } : { studio };
	}

	// TMDB collections. Movies only.

	/** exact key, so notfound = definitively not a movie (all TV lands here); failed = the request failed */
	findTmdbMovieIdByImdbId(imdbId: string): Promise<LookupResult<number>> {
		if (!this.tmdbApiKey) return Promise.resolve(NO_KEY);
		if (!imdbId) return Promise.resolve(NOT_FOUND);
		return attempt(async () => (await this.tmdbFindIds(imdbId)).movie || null, lookupOfError);
	}

	/** fallback for manually-added titles with no IMDb link. Top result — can miss. */
	async searchTmdbMovieId(title: string, year?: string): Promise<number | null> {
		if (!this.tmdbApiKey || !title.trim()) return null;
		const yearParam = year?.match(/^(\d{4})/)?.[1];
		const url =
			`${TMDB_BASE}/search/movie?query=${encodeURIComponent(title)}&page=1` +
			(yearParam ? `&primary_release_year=${yearParam}` : '');
		try {
			const data = await this.fetchWithTimeout(url, this.tmdbHeaders());
			return readOptionalNumber(at(data, 'results', 0, 'id')) ?? null;
		} catch {
			return null;
		}
	}

	/** notfound = the movie belongs to no collection; failed = the request failed */
	getTmdbMovieCollection(tmdbId: number): Promise<LookupResult<TmdbCollectionRef>> {
		if (!this.tmdbApiKey) return Promise.resolve(NO_KEY);
		return attempt(async () => {
			const detail = await this.fetchWithTimeout(`${TMDB_BASE}/movie/${tmdbId}`, this.tmdbHeaders());
			const id = readOptionalNumber(at(detail, 'belongs_to_collection', 'id'));
			if (!id) return null;
			const ref: TmdbCollectionRef = { id, name: readString(at(detail, 'belongs_to_collection', 'name')) };
			const poster = readOptionalString(at(detail, 'belongs_to_collection', 'poster_path'));
			return poster ? { ...ref, poster_path: poster } : ref;
		}, lookupOfError);
	}

	async getTmdbCollection(collectionId: number): Promise<TmdbCollectionDetail | null> {
		if (!this.tmdbApiKey) return null;
		try {
			const data = await this.fetchWithTimeout(`${TMDB_BASE}/collection/${collectionId}`, this.tmdbHeaders());
			return tmdbCollectionDetail(data);
		} catch {
			return null;
		}
	}

	async getTmdbByImdbId(imdbId: string): Promise<MediaSearchResult | null> {
		if (!this.tmdbApiKey) return null;
		try {
			const { movie, tv } = await this.tmdbFindIds(imdbId);
			if (movie !== undefined) return this.getTmdbMovieDetails(String(movie));
			return tv !== undefined ? this.getTmdbTvDetails(String(tv)) : null;
		} catch {
			return null;
		}
	}

	// Community ratings

	private extractImdbId(externalLink: string): string {
		const m = externalLink.match(/tt\d+/);
		return m ? m[0] : '';
	}

	private fetchMalRating(malId: number): Promise<CommunityScore | null> {
		return quietly(async () => {
			const data = await this.fetchWithTimeout(`${this.jikan.base}/anime/${malId}`);
			return scoreOf(readNumber(at(data, 'data', 'score')), readNumber(at(data, 'data', 'scored_by')));
		});
	}

	private fetchAniListRating(anilistId: number): Promise<CommunityScore | null> {
		return quietly(async () => {
			const media = await this.queryAniListById(anilistId);
			return scoreOf(readNumber(at(media, 'averageScore')), readNumber(at(media, 'popularity')));
		});
	}

	private fetchOmdbRating(imdbId: string): Promise<CommunityScore | null> {
		if (!this.omdbApiKey) return Promise.resolve(null);
		return quietly(async () => {
			const data = await this.fetchWithTimeout(omdbDetailUrl(imdbId, this.omdbApiKey));
			if (readString(at(data, 'Response')) === 'False') return null;
			return scoreOf(parseOmdbRating(readString(at(data, 'imdbRating'))), parseOmdbVotes(readString(at(data, 'imdbVotes'))));
		});
	}

	private fetchTmdbRatingByImdb(imdbId: string): Promise<CommunityScore | null> {
		if (!this.tmdbApiKey) return Promise.resolve(null);
		return quietly(async () => {
			const data = await this.fetchWithTimeout(`${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, this.tmdbHeaders());
			const hit = at(data, 'movie_results', 0) ?? at(data, 'tv_results', 0);
			return scoreOf(readNumber(at(hit, 'vote_average')), readNumber(at(hit, 'vote_count')));
		});
	}

	/** Anime APIs in the preferred order; a title with neither id has nothing to ask. */
	private async fetchAnimeRating(title: HoardTitle, preferred: 'jikan' | 'anilist'): Promise<CommunityRating | null> {
		const order = preferred === 'anilist' ? (['anilist', 'mal'] as const) : (['mal', 'anilist'] as const);
		for (const source of order) {
			const id = (source === 'mal' ? title.malId : title.anilistId) ?? 0;
			if (id <= 0) continue;
			const score = source === 'mal' ? await this.fetchMalRating(id) : await this.fetchAniListRating(id);
			if (score) return { ...score, source };
		}
		return null;
	}

	/** IMDb ratings from OMDb, then TMDB's copy of the same title; needs an IMDb id in the link. */
	private async fetchImdbRating(title: HoardTitle): Promise<CommunityRating | null> {
		const imdbId = this.extractImdbId(title.externalLink ?? '');
		if (!imdbId) return null;
		const omdb = await this.fetchOmdbRating(imdbId);
		if (omdb) return { ...omdb, source: 'imdb' };
		const tmdb = await this.fetchTmdbRatingByImdb(imdbId);
		return tmdb ? { ...tmdb, source: 'tmdb' } : null;
	}

	/**
	 * Picks the API from the title's stored IDs and returns community rating + vote count +
	 * source label. null on failure or when no API fits.
	 */
	async fetchCommunityRating(
		title: HoardTitle,
		animeApiSource: 'jikan' | 'anilist' = 'jikan',
		apiGroup: 'anime' | 'movie' | '' = '',
	): Promise<{ rating: number; votes: number; source: 'mal' | 'anilist' | 'imdb' | 'tmdb' } | null> {
		const group = mediaGroupOf(title, apiGroup);
		if (group === '') return null;
		// the anime API group is bound to anime APIs; an anime with no anime-api ID falls through to IMDb/TMDB
		if (group === 'anime') {
			const anime = await this.fetchAnimeRating(title, animeApiSource);
			if (anime) return anime;
		}
		return this.fetchImdbRating(title);
	}

	/**
	 * Re-fetches an existing title's trailer from its source, reusing the add-time paths:
	 * AniList/Jikan for anime (honouring `animeApiSource`, falling back to the other ID),
	 * TMDB-by-IMDb for movies/TV. OMDb carries no trailers. notfound = the sources answered without
	 * one (or the title has no id to ask with); failed = a request failed; nokey = no TMDB key.
	 */
	fetchTrailer(
		title: HoardTitle,
		animeApiSource: 'jikan' | 'anilist' = 'jikan',
		apiGroup: 'anime' | 'movie' | '' = '',
	): Promise<LookupResult<string>> {
		const group = mediaGroupOf(title, apiGroup);
		if (group === 'anime') return firstFound(this.animeTrailerSources(title, animeApiSource));
		if (group === 'movie') return this.tmdbTrailerByImdb(this.extractImdbId(title.externalLink ?? ''));
		return Promise.resolve(NOT_FOUND);
	}

	/** One source per anime id the title has; a title with neither id has nothing to ask. */
	private animeTrailerSources(title: HoardTitle, animeApiSource: 'jikan' | 'anilist'): LookupSource<string>[] {
		const anilist = (anilistId: number): LookupSource<string> => () => attempt(async () => {
			const media = await this.queryAniListById(anilistId);
			return anilistTrailerUrl(media?.trailer) || null;
		}, lookupOfError);
		const jikan = (malId: number): LookupSource<string> => () => this.getJikanTrailerByMalId(malId);
		return animeSources(title, animeApiSource, anilist, jikan);
	}

	/** TMDB trailer through an IMDb id: find the movie/tv id, then its videos. */
	private async tmdbTrailerByImdb(imdbId: string): Promise<LookupResult<string>> {
		if (!this.tmdbApiKey) return NO_KEY;
		if (!imdbId) return NOT_FOUND;
		return attempt(async () => {
			const { movie, tv } = await this.tmdbFindIds(imdbId);
			const [kind, id] = movie !== undefined ? ['movie', movie] : ['tv', tv];
			if (id === undefined) return null;
			const videos = await this.fetchWithTimeout(`${TMDB_BASE}/${kind}/${String(id)}/videos`, this.tmdbHeaders());
			return tmdbTrailerUrl(at(videos, 'results')) || null;
		}, lookupOfError);
	}

	/**
	 * One-time director/cast backfill for an existing title, keyed off the IMDb id in its
	 * stored externalLink. Prefers the active API, falls back to the others, Cinemeta last (keyless).
	 * notfound = no usable id, or no source knows the title; failed = a source's request failed and
	 * none found anything; nokey = every keyed source lacks its key.
	 */
	fetchCredits(title: HoardTitle, source: MediaSource = 'omdb'): Promise<LookupResult<CreditsLookup>> {
		const imdbId = this.extractImdbId(title.externalLink ?? '');
		if (!imdbId) return Promise.resolve(NOT_FOUND);
		const sources: Record<MediaSource, LookupSource<CreditsLookup>> = {
			omdb: () => this.omdbCredits(imdbId),
			tmdb: () => this.tmdbCredits(imdbId),
			cinemeta: () => this.cinemetaCredits(imdbId, title),
		};
		const order: MediaSource[] =
			source === 'cinemeta' ? ['cinemeta', 'omdb', 'tmdb']
				: source === 'tmdb' ? ['tmdb', 'omdb', 'cinemeta']
					: ['omdb', 'tmdb', 'cinemeta'];
		return firstFound(order.map((name) => sources[name]));
	}

	/**
	 * OMDb: Director/Actors ride in the plain detail response — one cheap call (deliberately
	 * NOT getOmdbTvDetails, which fans out per-season requests).
	 */
	private omdbCredits(imdbId: string): Promise<LookupResult<CreditsLookup>> {
		if (!this.omdbApiKey) return Promise.resolve(NO_KEY);
		return attempt(async () => {
			const data = readRecord(await this.fetchWithTimeout(omdbDetailUrl(imdbId, this.omdbApiKey)));
			if (readString(data.Response) === 'False' || !readString(data.imdbID)) return null;
			return creditsOf({
				// series carry no per-title Director; their creators fill the field
				director: readString(data.Type) === 'series' ? omdbSeriesDirectorCredits(data) : omdbNamesToCredits(data.Director),
				cast: omdbNamesToCredits(data.Actors),
			});
		}, lookupOfError);
	}

	/** TMDB: resolve the IMDb id via /find, then hit the lean /credits endpoint. */
	private tmdbCredits(imdbId: string): Promise<LookupResult<CreditsLookup>> {
		if (!this.tmdbApiKey) return Promise.resolve(NO_KEY);
		return attempt(async () => {
			const { movie: movieId, tv: tvId } = await this.tmdbFindIds(imdbId);
			if (movieId !== undefined) {
				return creditsOf(tmdbCreditsToStored(await this.fetchWithTimeout(`${TMDB_BASE}/movie/${movieId}/credits`, this.tmdbHeaders())));
			}
			if (tvId === undefined) return null;
			// TV: the creators live on the detail response (created_by), not in /credits — fold the
			// cast lookup in via append_to_response
			const detail = await this.fetchWithTimeout(`${TMDB_BASE}/tv/${tvId}?append_to_response=credits`, this.tmdbHeaders());
			return creditsOf({
				director: tmdbSeriesDirectorCredits(detail),
				cast: tmdbCreditsToStored(at(detail, 'credits')).cast,
			});
		}, lookupOfError);
	}

	/** Keyless credits: the series record first for an unknown kind (the movie endpoint answers series ids with a foreign film). */
	private cinemetaCredits(imdbId: string, title: HoardTitle): Promise<LookupResult<CreditsLookup>> {
		return attempt(async () => {
			const kind = explicitMediaKind(title);
			for (const k of kind ? [kind] : (['tv', 'movie'] as const)) {
				let meta: MediaSearchResult | null;
				try {
					meta = await this.getCinemetaDetails(imdbId, k);
				} catch (e) {
					// no such record of this kind: try the other one
					if (lookupOfError(e).status === 'notfound') continue;
					throw e;
				}
				if (!meta) continue;
				return creditsOf({ director: normalizeCreditsForStore(meta.director), cast: normalizeCreditsForStore(meta.cast) });
			}
			return null;
		}, lookupOfError);
	}

	// Google Books (Books)

	/**
	 * Largest available cover from a volume's imageLinks, falling down extraLarge → large →
	 * medium → small → thumbnail → smallThumbnail. Returns a direct (200) HTTPS URL, upgraded
	 * from http and stripped of the page-curl effect, so no local caching is needed. '' when
	 * there is no image.
	 */
	private googleCoverUrl(info: unknown): string {
		const links = at(info, 'imageLinks');
		const raw = GOOGLE_COVER_SIZES.map((size) => readString(at(links, size))).find((url) => url !== '') ?? '';
		if (!raw) return '';
		// bump Google's default cover (thumbnail is zoom=1 ≈ 128px, blurry on a card) to zoom=2 ≈
		// 300px — sharp yet light. Only thumbnail-class URLs carry a zoom param.
		return httpsOrEmpty(
			raw
				.replace(/^http:/, 'https:')
				.replace(/&edge=curl/g, '')
				.replace(/([?&]zoom=)\d+/, (_m, p1: string) => `${p1}2`),
		);
	}

	/** Normalizes Google's `publishedDate` (YYYY | YYYY-MM | YYYY-MM-DD) to YYYY-MM-DD. */
	private googleReleaseDate(published?: string): string {
		if (!published) return '';
		if (/^\d{4}-\d{2}-\d{2}$/.test(published)) return published;
		if (/^\d{4}-\d{2}$/.test(published)) return `${published}-01`;
		if (/^\d{4}$/.test(published)) return `${published}-01-01`;
		return published;
	}

	private mapGoogleVolume(item: unknown): BookSearchResult {
		const info = at(item, 'volumeInfo');
		const published = readString(at(info, 'publishedDate'));
		const year = published ? parseInt(published.slice(0, 4), 10) || 0 : 0;
		const title = readString(at(info, 'title'));
		const subtitle = readString(at(info, 'subtitle'));
		return {
			title: subtitle ? `${title}: ${subtitle}` : title,
			author: readStringList(at(info, 'authors')).join(', '),
			year,
			totalPages: readNumber(at(info, 'pageCount')),
			coverUrl: this.googleCoverUrl(info),
			googleBooksId: readString(at(item, 'id')),
			openLibraryId: '',
			releaseDate: this.googleReleaseDate(published),
			url: httpsOrEmpty(readOptionalString(at(info, 'infoLink')) ?? readString(at(info, 'canonicalVolumeLink'))),
		};
	}

	/**
	 * Google Books requests must always carry the user's API key — the anonymous endpoint
	 * shares a global quota and returns 429. Throws ApiError so callers can show an accurate
	 * message. `path` is everything after the base, e.g. `/volumes?q=...`; `key` is appended here.
	 */
	private async googleBooksFetch(path: string): Promise<unknown> {
		const key = this.googleBooksApiKey.trim();
		if (!key) throw new ApiError('googleBooks', 'no-key', 'Google Books API key not set');
		const sep = path.includes('?') ? '&' : '?';
		// the classification splits Google's overloaded 403 (quota vs disabled API vs bad key) on the body
		return await requestJson('googleBooks', { url: `${GOOGLE_BOOKS_BASE}${path}${sep}key=${encodeURIComponent(key)}` });
	}

	/** Throws ApiError on failure. */
	async searchGoogleBooks(query: string): Promise<BookSearchResult[]> {
		const data = await this.googleBooksFetch(`/volumes?q=${encodeURIComponent(query)}&maxResults=10`);
		return recordsOf(at(data, 'items')).slice(0, 10).map((item) => this.mapGoogleVolume(item));
	}

	/** Resolves on success, throws ApiError so the test can report the real cause. */
	async checkGoogleBooksConnection(): Promise<boolean> {
		const data = await this.googleBooksFetch('/volumes?q=tolkien&maxResults=1');
		return Array.isArray(at(data, 'items'));
	}

	// Jikan (Manga)

	private mapJikanManga(m: unknown): MangaSearchResult {
		const from = readString(at(m, 'published', 'from'));
		const year = from ? parseInt(from.slice(0, 4), 10) || 0 : 0;
		const malId = readNumber(at(m, 'mal_id'));
		const jpg = at(m, 'images', 'jpg');
		return {
			malId,
			title: readOptionalString(at(m, 'title_english')) ?? readString(at(m, 'title')),
			author: recordsOf(at(m, 'authors')).map((a) => readString(a.name)).join(', '),
			year,
			totalChapters: readNumber(at(m, 'chapters')),
			totalVolumes: readNumber(at(m, 'volumes')),
			coverUrl: httpsOrEmpty(readOptionalString(at(jpg, 'large_image_url')) ?? readString(at(jpg, 'image_url'))),
			releaseDate: from.split('T')[0] ?? '',
			url: httpsOrEmpty(readString(at(m, 'url'))) || `https://myanimelist.net/manga/${malId}`,
		};
	}

	/** throws ApiError */
	async searchManga(query: string): Promise<MangaSearchResult[]> {
		const url = `${this.jikan.base}/manga?q=${encodeURIComponent(query)}&limit=10`;
		const data = await this.throttleJikan(() => this.fetchWithTimeout(url));
		return recordsOf(at(data, 'data')).map((m) => this.mapJikanManga(m));
	}

	/**
	 * Detail lookup for one manga (Jikan /manga/{mal_id}). Search-list results return null
	 * chapters/volumes for ongoing titles, so totals are fetched here on selection. Shares
	 * the Jikan throttle.
	 */
	async getMangaByMalId(malId: number): Promise<MangaSearchResult | null> {
		const url = `${this.jikan.base}/manga/${malId}`;
		try {
			const item = at(await this.throttleJikan(() => this.fetchWithTimeout(url)), 'data');
			return isRecord(item) ? this.mapJikanManga(item) : null;
		} catch {
			return null;
		}
	}

	/**
	 * Detail lookup for one Google Books volume. The search endpoint sometimes omits
	 * pageCount and only returns thumbnails, so selection resolves the full volume. null when
	 * it can't be fetched.
	 */
	async getGoogleBookById(volumeId: string): Promise<BookSearchResult | null> {
		if (!volumeId) return null;
		const item = await this.googleBooksFetch(`/volumes/${encodeURIComponent(volumeId)}`);
		if (!readOptionalString(at(item, 'id'))) return null;
		return this.mapGoogleVolume(item);
	}

	/** Resolves on success, throws ApiError so the test can report the real cause. */
	async checkTmdbConnection(): Promise<boolean> {
		if (!this.tmdbApiKey) throw new ApiError('tmdb', 'no-key', 'TMDB token not set');
		const url = `${TMDB_BASE}/movie/550`;
		const data = await this.fetchWithTimeout(url, this.tmdbHeaders());
		return at(data, 'id') !== undefined;
	}

	/** Resolves on success, throws ApiError so the test can report the real cause. */
	async checkOmdbConnection(): Promise<boolean> {
		if (!this.omdbApiKey) throw new ApiError('omdb', 'no-key', 'OMDb API key not set');
		// a known IMDb ID (The Shawshank Redemption) as a connectivity test
		const url = `${OMDB_BASE}/?i=tt0111161&apikey=${encodeURIComponent(this.omdbApiKey)}`;
		const data = await this.fetchWithTimeout(url);
		assertOmdbOk(data);
		return at(data, 'Response') === 'True';
	}

	// Games — RAWG

	private mapRawgGame(g: unknown): GameSearchResult {
		const slug = readString(at(g, 'slug'));
		return {
			source: 'rawg',
			id: readNumber(at(g, 'id')),
			title: readString(at(g, 'name')),
			releaseDate: readString(at(g, 'released')),
			coverUrl: httpsOrEmpty(readString(at(g, 'background_image'))),
			platforms: namesOf(recordsOf(at(g, 'platforms')).map((p) => at(p, 'platform'))),
			url: slug ? `https://rawg.io/games/${slug}` : '',
		};
	}

	/** throws ApiError */
	async searchRawgGames(query: string): Promise<GameSearchResult[]> {
		if (!this.hasRawgKey()) throw new ApiError('rawg', 'no-key', 'RAWG API key not set');
		const url = `${RAWG_BASE}/games?key=${encodeURIComponent(this.rawgApiKey)}&search=${encodeURIComponent(query)}&page_size=10`;
		const data = await this.fetchWithTimeout(url);
		return recordsOf(at(data, 'results'))
			.filter(hasIdAndName)
			.map((g) => this.mapRawgGame(g));
	}

	/**
	 * Detail + store links for one RAWG game (two parallel requests — the detail payload's own
	 * `stores` array carries no per-game URLs). Store pick follows RAWG_STORE_PRIORITY, else
	 * the first store with a URL.
	 */
	async getRawgGameDetails(id: number): Promise<GameDetailsResult | null> {
		const key = encodeURIComponent(this.rawgApiKey);
		const [detail, stores] = await Promise.all([
			this.fetchWithTimeout(`${RAWG_BASE}/games/${id}?key=${key}`),
			this.fetchWithTimeout(`${RAWG_BASE}/games/${id}/stores?key=${key}`).catch(() => null),
		]);
		if (!isRecord(detail) || !hasIdAndName(detail)) return null;

		// game modes come from the (english) tag slugs
		const tagSlugs = new Set(
			recordsOf(detail.tags)
				.filter((t) => readString(t.language, 'eng') === 'eng')
				.map((t) => readString(t.slug))
				.filter(Boolean),
		);

		return {
			...this.mapRawgGame(detail),
			developer: namesOf(detail.developers).join(', '),
			publisher: namesOf(detail.publishers).join(', '),
			singleplayer: tagSlugs.has('singleplayer'),
			coop: RAWG_COOP_TAGS.some((t) => tagSlugs.has(t)),
			multiplayer: RAWG_MULTIPLAYER_TAGS.some((t) => tagSlugs.has(t)),
			storeUrl: rawgStoreUrl(stores),
		};
	}

	/** Resolves on success, throws ApiError so the test can report the real cause. */
	async checkRawgConnection(): Promise<boolean> {
		if (!this.hasRawgKey()) throw new ApiError('rawg', 'no-key', 'RAWG API key not set');
		const url = `${RAWG_BASE}/games?key=${encodeURIComponent(this.rawgApiKey)}&page_size=1`;
		return Array.isArray(at(await this.fetchWithTimeout(url), 'results'));
	}

	// Games — IGDB (via Twitch OAuth)

	/**
	 * A valid IGDB app access token, fetching a fresh one through the Twitch
	 * client-credentials flow when none is cached or the cache expired (60 s margin).
	 * Throws when credentials are missing or rejected.
	 */
	private async getIgdbToken(): Promise<string> {
		if (!this.hasIgdbCredentials()) throw new ApiError('twitch', 'no-key', 'IGDB credentials not set');
		if (this.igdbToken && Date.now() < this.igdbTokenExpiry) return this.igdbToken;

		const url =
			`${TWITCH_TOKEN_URL}?client_id=${encodeURIComponent(this.igdbClientId)}` +
			`&client_secret=${encodeURIComponent(this.igdbClientSecret)}` +
			`&grant_type=client_credentials`;
		// source 'twitch', not 'igdb': a rejected Client ID/Secret is a different fix from a
		// rejected query, and the two used to give the same message
		const data = await requestJson('twitch', { url, method: 'POST' }, assertTokenIssued);
		this.igdbToken = readString(at(data, 'access_token'));
		this.igdbTokenExpiry = Date.now() + Math.max(0, readNumber(at(data, 'expires_in')) - 60) * 1000;
		return this.igdbToken;
	}

	/** POSTs an Apicalypse query (plain-text body) to an IGDB endpoint. */
	private async igdbPost(endpoint: string, query: string): Promise<unknown> {
		const token = await this.getIgdbToken();
		try {
			return await requestJson('igdb', {
				url: `${IGDB_BASE}/${endpoint}`,
				method: 'POST',
				headers: {
					'Client-ID': this.igdbClientId,
					'Authorization': `Bearer ${token}`,
				},
				body: query,
			});
		} catch (e) {
			// a rejected token (revoked / expired early) must not poison the cache
			this.igdbToken = '';
			this.igdbTokenExpiry = 0;
			throw e;
		}
	}

	private mapIgdbGame(g: unknown): GameSearchResult {
		const ts = at(g, 'first_release_date');
		// deliberately UTC, not the local toIsoDate: IGDB gives a UTC epoch for the release *day*,
		// so converting locally shifts the date by one for anyone west of UTC
		const releaseDate =
			typeof ts === 'number' && ts > 0
				? new Date(ts * 1000).toISOString().split('T')[0] ?? ''
				: '';
		const imageId = readString(at(g, 'cover', 'image_id'));
		return {
			source: 'igdb',
			id: readNumber(at(g, 'id')),
			title: readString(at(g, 'name')),
			releaseDate,
			coverUrl: imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : '',
			platforms: namesOf(at(g, 'platforms')),
			url: httpsOrEmpty(readString(at(g, 'url'))),
		};
	}

	async searchIgdbGames(query: string): Promise<GameSearchResult[]> {
		// Apicalypse strings are double-quoted — strip quotes/backslashes from input.
		const safe = query.replace(/["\\]/g, ' ').trim();
		const data = await this.igdbPost(
			'games',
			`search "${safe}"; fields name, first_release_date, cover.image_id, platforms.name, url; limit 10;`,
		);
		return recordsOf(data).filter(hasIdAndName).map((g) => this.mapIgdbGame(g));
	}

	async getIgdbGameDetails(id: number): Promise<GameDetailsResult | null> {
		const data = await this.igdbPost(
			'games',
			'fields name, first_release_date, cover.image_id, platforms.name, url, ' +
				'game_modes.name, websites.url, ' +
				'involved_companies.developer, involved_companies.publisher, involved_companies.company.name; ' +
				`where id = ${id | 0}; limit 1;`,
		);
		const g = recordsOf(data)[0];
		if (!g || readString(g.name) === '') return null;

		const companies = recordsOf(g.involved_companies);
		const names = (list: typeof companies): string =>
			[...new Set(namesOf(list.map((c) => c.company)))].join(', ');

		const modes = new Set(namesOf(g.game_modes));
		const siteUrls = recordsOf(g.websites).map((w) => httpsOrEmpty(readString(w.url))).filter(Boolean);
		const storeUrl = IGDB_STORE_DOMAINS.map((domain) => siteUrls.find((u) => u.includes(domain))).find(Boolean) ?? '';

		return {
			...this.mapIgdbGame(g),
			developer: names(companies.filter((c) => c.developer === true)),
			publisher: names(companies.filter((c) => c.publisher === true)),
			singleplayer: modes.has('Single player'),
			coop: [...modes].some((m) => IGDB_COOP_MODES.has(m)),
			multiplayer: [...modes].some((m) => IGDB_MULTIPLAYER_MODES.has(m)),
			storeUrl,
		};
	}

	/** Resolves on success, throws ApiError so the test can report the real cause. */
	async checkIgdbConnection(): Promise<boolean> {
		if (!this.hasIgdbCredentials()) throw new ApiError('twitch', 'no-key', 'IGDB credentials not set');
		const data = await this.igdbPost('games', 'fields id; limit 1;');
		return Array.isArray(data);
	}

	// Games — Steam (Web API + Storefront). Not a search source: the Storefront API has no
	// search endpoint and the only name index (ISteamApps/GetAppList) is a ~200k-entry,
	// multi-MB download. So it never backs AddGameModal — it fills in playtime and
	// achievements from the user's own account, which no other API can.

	setSteamCredentials(apiKey: string, steamId: string): void {
		this.steamApiKey = apiKey;
		this.steamId = steamId;
	}

	hasSteamCredentials(): boolean {
		return this.steamApiKey.trim().length > 0 && this.steamId.trim().length > 0;
	}

	/**
	 * GET returning the raw status alongside the parsed body. The Steam endpoints signal real,
	 * expected conditions through status codes (no achievements = 400, locked-down profile =
	 * 403), so unlike fetchWithTimeout these must not collapse into a thrown error.
	 */
	private steamGet(url: string): Promise<{ status: number; json: unknown }> {
		return withTimeout(
			() => requestUrl({ url, throw: false }).then((r) => {
				let json: unknown = null;
				// .json throws on a non-JSON body (Steam serves HTML error pages).
				try { json = JSON.parse(r.text) as unknown; } catch { json = null; }
				return { status: r.status, json };
			}),
			() => new Error('Request timed out'),
		);
	}

	/**
	 * Normalizes whatever the user pasted into a SteamID64: the id itself, a profile URL of
	 * either shape, or a bare vanity name (resolved through the API). '' when unresolvable.
	 */
	async resolveSteamId(input: string): Promise<string> {
		const { id, vanity } = parseSteamInput(input.trim());
		if (id !== '') return id;
		if (vanity === '' || this.steamApiKey.trim() === '') return '';

		try {
			const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/`
				+ `?key=${encodeURIComponent(this.steamApiKey)}`
				+ `&vanityurl=${encodeURIComponent(vanity)}`;
			const { json } = await this.steamGet(url);
			const res = at(json, 'response');
			return at(res, 'success') === 1 ? readString(at(res, 'steamid')) : '';
		} catch {
			return '';
		}
	}

	/**
	 * The user's owned games with playtime. One request for the whole library.
	 *
	 * A private profile is the most common failure here and it does NOT error — Steam answers
	 * 200 with an empty `response` object — so the result distinguishes it from "you genuinely
	 * own nothing" for the caller's message.
	 */
	async getSteamOwnedGames(): Promise<SteamLibraryResult> {
		if (!this.hasSteamCredentials()) return { ok: false, reason: 'missing', games: [] };
		try {
			const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/`
				+ `?key=${encodeURIComponent(this.steamApiKey)}`
				+ `&steamid=${encodeURIComponent(this.steamId)}`
				+ '&include_appinfo=1&include_played_free_games=1';
			const { status, json } = await this.steamGet(url);
			if (status === 401 || status === 403) return { ok: false, reason: 'badKey', games: [] };
			if (status !== 200) return { ok: false, reason: 'network', games: [] };

			const res = at(json, 'response');
			// {} rather than { game_count: 0, games: [] } — the private-profile shape.
			const list = at(res, 'games');
			if (!Array.isArray(list)) {
				return { ok: false, reason: at(res, 'game_count') === 0 ? 'empty' : 'private', games: [] };
			}
			return { ok: true, reason: 'ok', games: readList(list, steamOwnedGame) };
		} catch {
			return { ok: false, reason: 'network', games: [] };
		}
	}

	/**
	 * Earned / total achievements for one app. One request per game — the only part of a sync
	 * that scales with library size.
	 *
	 * Returns null for "this game has no achievements", which Steam reports as a 400 with an
	 * error payload rather than an empty list; treating that as a failure would mark a large
	 * slice of any real library as broken.
	 */
	async getSteamAchievements(appId: string): Promise<{ earned: number; total: number } | null> {
		if (!this.hasSteamCredentials()) return null;
		try {
			const url = `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v1/`
				+ `?key=${encodeURIComponent(this.steamApiKey)}`
				+ `&steamid=${encodeURIComponent(this.steamId)}`
				+ `&appid=${encodeURIComponent(appId)}`;
			const { status, json } = await this.steamGet(url);
			if (status !== 200) return null;
			const stats = at(json, 'playerstats');
			const list = at(stats, 'achievements');
			if (!readBoolean(at(stats, 'success')) || !Array.isArray(list)) return null;
			return {
				earned: recordsOf(list).filter((a) => a.achieved === 1).length,
				total: list.length,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Storefront metadata for one app — no key, but rate-limited (~200 requests per 5 minutes
	 * per IP), so callers must throttle. Only used when importing a game the library doesn't
	 * have yet.
	 */
	async getSteamAppDetails(appId: string): Promise<SteamAppDetails | null> {
		try {
			const url = `${STEAM_STORE_BASE}/appdetails?appids=${encodeURIComponent(appId)}`;
			const { status, json } = await this.steamGet(url);
			if (status !== 200 || !json) return null;
			const entry = readRecord(json)[appId];
			const d = at(entry, 'data');
			if (!readBoolean(at(entry, 'success')) || !isRecord(d)) return null;

			const categoryIds = new Set(readList(d.categories, (c) => readOptionalNumber(at(c, 'id'))));
			return {
				name: readString(d.name),
				developer: readStringList(d.developers).join(', '),
				publisher: readStringList(d.publishers).join(', '),
				genres: recordsOf(d.genres).map((g) => readString(g.description)).filter((g) => g !== ''),
				releaseDate: parseSteamReleaseDate(readString(at(d, 'release_date', 'date'))),
				coverUrl: steamLibraryCover(appId),
				storeUrl: `https://store.steampowered.com/app/${appId}/`,
				singleplayer: categoryIds.has(STEAM_CAT_SINGLEPLAYER),
				coop: [...categoryIds].some((id) => STEAM_COOP_CATS.has(id)),
				multiplayer: categoryIds.has(STEAM_CAT_MULTIPLAYER),
			};
		} catch {
			return null;
		}
	}

	// Keyless sources (Cinemeta, Open Library, Steam Store)

	/** Whether Steam publishes the library capsule for this app. A network error rejects, so callers keep the old cover. */
	async steamCoverExists(appId: string): Promise<boolean> {
		const { status } = await requestUrl({ url: steamLibraryCover(appId), method: 'HEAD', throw: false });
		return status === 200;
	}

	async searchCinemeta(query: string, kind: CinemetaKind, year?: string): Promise<MediaSearchResult[]> {
		const json = await this.request({ url: cinemetaSearchUrl(kind, query) });
		return mapCinemetaSearch(json, kind, year ?? '', SEARCH_RESULT_LIMIT);
	}

	async getCinemetaDetails(imdbId: string, kind: 'movie' | 'tv'): Promise<MediaSearchResult | null> {
		const cinemetaKind: CinemetaKind = kind === 'tv' ? 'series' : 'movie';
		return mapCinemetaMeta(await this.request({ url: cinemetaMetaUrl(cinemetaKind, imdbId) }), cinemetaKind);
	}

	async searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
		return mapOpenLibrarySearch(await this.request({ url: openLibrarySearchUrl(query) }));
	}

	async getOpenLibraryWork(id: string): Promise<BookSearchResult | null> {
		if (id === '') return null;
		return mapOpenLibraryWork(await this.request({ url: openLibraryWorkUrl(id) }));
	}

	async searchSteamStore(query: string): Promise<GameSearchResult[]> {
		return mapSteamStoreSearch(await this.request({ url: steamStoreSearchUrl(query) }));
	}

	async getSteamStoreDetails(row: GameSearchResult): Promise<GameDetailsResult | null> {
		const details = await this.getSteamAppDetails(String(row.id));
		return details ? steamDetailsToGameDetails(row, details) : null;
	}

	/** Test-connection probe: one GetOwnedGames call, reported by reason. */
	async checkSteamConnection(): Promise<SteamLibraryResult> {
		return this.getSteamOwnedGames();
	}
}

// Steam helpers

/** Steam appid out of a store URL, '' when the URL isn't a Steam store page. */
export function steamAppIdFromUrl(url: string): string {
	return url.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1] ?? '';
}

/**
 * Storefront release dates are display strings in the store's locale ('12 Mar, 2020',
 * 'Mar 12, 2020', 'Q1 2021', 'Coming soon'). Only a fully resolved day converts; anything
 * vaguer returns null rather than a guess, because releaseDate drives the auto
 * "To be released" status.
 */
function parseSteamReleaseDate(raw: string): string | null {
	const text = raw.trim();
	if (text === '') return null;
	const parsed = Date.parse(text);
	if (Number.isNaN(parsed)) return null;
	const d = new Date(parsed);
	// local getters, not toISOString — see the date rules in types.ts
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * RAWG's `background_image` is a full-resolution screenshot (routinely 3840×2160,
 * multi-MB) — far too heavy for a 140×210 poster card; the fetch + decode is what made
 * Games covers flash their letter placeholder and stutter the grid scroll. media.rawg.io
 * exposes an on-the-fly resize endpoint (`/media/resize/<width>/-/<path>`), so display
 * sites rewrite through this helper instead of storing a downscaled URL. Non-RAWG and
 * already-resized URLs pass through untouched.
 */
export function rawgResizedCover(url: string, width = 640): string {
	const prefix = 'https://media.rawg.io/media/';
	if (!url.startsWith(prefix)) return url;
	const rest = url.slice(prefix.length);
	if (rest.startsWith('resize/') || rest.startsWith('crop/')) return url;
	return `${prefix}resize/${width}/-/${rest}`;
}
