import { formatExternalId } from '../../storage/externalId';
import { AIRTIME_PROPS, COMMON_PROPS, GAME_PROPS, READING_PROPS, TITLE_PROPS } from '../../storage/properties';
import type { ExternalSource } from '../../storage/storageTypes';

const C = COMMON_PROPS;
const A = AIRTIME_PROPS;
const T = TITLE_PROPS;
const R = READING_PROPS;
const G = GAME_PROPS;

/** Hoard 0.1 / WatchLog Sync frontmatter key -> current property name. */
export const OLD_TO_NEW: Readonly<Record<string, string>> = {
	// common
	title: C.name,
	type: C.type,
	status: C.status,
	rating: C.rating,
	favorite: C.favorite,
	dateFavorited: C.dateFavorited,
	dateStarted: C.dateStarted,
	dateFinished: C.dateFinished,
	dateAdded: C.dateAdded,
	dateModified: C.dateModified,
	releaseDate: C.releaseDate,
	externalLink: C.url,
	externalId: C.externalId,
	groups: C.groups,
	poster: C.cover,
	coverUrl: C.cover,
	manualPosterUrl: C.cover,
	// airtime
	airtimeRecurrence: A.recurrence,
	airtimeDay: A.day,
	airtimeTime: A.time,
	airtimeSeason: A.season,
	airtimeEpisode: A.episode,
	airtimeAcknowledged: A.acknowledged,
	// titles
	priority: T.priority,
	review: T.review,
	progress: T.progress,
	totalEpisodes: T.totalEpisodes,
	episodeDuration: T.runtime,
	malId: T.malId,
	anilistId: T.anilistId,
	communityRating: T.communityRating,
	communityVotes: T.communityVotes,
	communitySource: T.communitySource,
	director: T.director,
	cast: T.cast,
	studio: T.studio,
	manualDirector: T.addedDirector,
	manualCast: T.addedCast,
	manualStudio: T.addedStudio,
	trailer: T.trailer,
	manualTrailerUrl: T.trailer,
	pinned: T.pinned,
	maybe: T.maybe,
	watched: T.watchedEpisodes,
	skipped: T.skippedEpisodes,
	seasons: T.seasons,
	// books and manga
	author: R.author,
	chaptersRead: R.chaptersRead,
	totalChapters: R.totalChapters,
	pagesRead: R.pagesRead,
	totalPages: R.totalPages,
	progressUnit: R.progressUnit,
	wordsRead: R.wordsRead,
	totalWords: R.totalWords,
	googleBooksId: R.googleBooksId,
	volumesRead: R.volumesRead,
	totalVolumes: R.totalVolumes,
	// games
	developer: G.developer,
	publisher: G.publisher,
	genre: G.genre,
	wishlist: G.wishlist,
	playtime: G.playtime,
	achievements: G.achievements,
	platforms: G.platforms,
	singleplayer: G.singleplayer,
	coop: G.coop,
	multiplayer: G.multiplayer,
	steamAppId: G.steamAppId,
	storeUrl: G.storeUrl,
	lastPlayed: G.lastPlayed,
};

const PERCENT_RE = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/;
const INT_RE = /^\s*\d+\s*$/;

/** Aligns the value type of keys whose type changed (progress text -> number, malId string -> number). */
function convertValue(oldKey: string, value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (oldKey === 'progress') {
		const m = PERCENT_RE.exec(value);
		return m ? Number(m[1]) : value;
	}
	if (oldKey === 'malId') return INT_RE.test(value) ? Number(value) : value;
	return value;
}

/** `External ID` from the older `apiSource` + `apiId` pair; undefined when absent or an identity already exists. */
function foldApiIdentity(fm: Record<string, unknown>): string | undefined {
	const { apiSource, apiId } = fm;
	if ('externalId' in fm || COMMON_PROPS.externalId in fm) return undefined;
	if (typeof apiSource !== 'string') return undefined;
	if (typeof apiId !== 'string' && typeof apiId !== 'number') return undefined;
	return formatExternalId({ source: apiSource as ExternalSource, id: String(apiId) });
}

/** Writes `key` under its new name; on collision the old key stays and is recorded in `kept`. */
function place(fm: Record<string, unknown>, out: Record<string, unknown>, kept: string[], key: string, value: unknown): void {
	const target = OLD_TO_NEW[key];
	if (!target) {
		out[key] = value;
	} else if (target in fm || target in out) {
		out[key] = value;
		kept.push(key);
	} else {
		out[target] = convertValue(key, value);
	}
}

/**
 * Translates 0.1 keys of a note's properties to the current names. Returns a new object with key order
 * preserved. An old key whose target already exists stays unchanged and is listed in `kept`.
 */
export function translateProperties(fm: Record<string, unknown>): { fm: Record<string, unknown>; kept: string[] } {
	const out: Record<string, unknown> = {};
	const kept: string[] = [];
	const apiValue = foldApiIdentity(fm);
	for (const [key, value] of Object.entries(fm)) {
		if (apiValue !== undefined && key === 'apiSource') out[COMMON_PROPS.externalId] = apiValue;
		else if (apiValue === undefined || key !== 'apiId') place(fm, out, kept, key, value);
	}
	return { fm: out, kept };
}
