import type { RecommendedDaily, Season } from '../domain/types';
import type { ApiCheckKind, ApiCheckResult, EntryCache, LocalData } from './storageTypes';
import { defined, isRecord } from '../domain/sharedHelpers';
import { at, readList, readRecord, readOneOf, readOptionalNumber, readOptionalString, readStringList } from '../domain/read';

/** Reads data.json's `cache` field by field: a field of the wrong type is dropped, the entry stays. */

const CHECK_KINDS: readonly ApiCheckKind[] = ['airing', 'seasons', 'poster', 'trailer', 'credits', 'studio'];
const CHECK_RESULTS: readonly ApiCheckResult[] = ['ok', 'transient', 'nokey', 'notfound'];

export function readSeason(v: unknown): Season | undefined {
	const name = at(v, 'name');
	const episodes = readOptionalNumber(at(v, 'episodes'));
	if (typeof name !== 'string' || episodes === undefined) return undefined;
	const season: Season = { name, episodes, offset: readOptionalNumber(at(v, 'offset')) ?? 0 };
	const skipped = readList(at(v, 'skippedEpisodes'), readOptionalNumber);
	if (skipped.length > 0) season.skippedEpisodes = skipped;
	return season;
}

function readApiCheck(v: unknown): EntryCache['apiCheck'] {
	const out: NonNullable<EntryCache['apiCheck']> = {};
	for (const kind of CHECK_KINDS) {
		const entry = at(v, kind);
		const result = readOneOf<ApiCheckResult | ''>(at(entry, 'result'), CHECK_RESULTS, '');
		const when = readOptionalString(at(entry, 'at'));
		if (result !== '' && when !== undefined) out[kind] = { at: when, result };
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

function readAiring(v: unknown): EntryCache['airing'] {
	const refreshedAt = readOptionalString(at(v, 'refreshedAt'));
	if (refreshedAt === undefined) return undefined;
	return {
		refreshedAt,
		...defined({
			nextSeason: readOptionalNumber(at(v, 'nextSeason')),
			nextEpisode: readOptionalNumber(at(v, 'nextEpisode')),
			nextAirDate: readOptionalString(at(v, 'nextAirDate')),
			lastSeason: readOptionalNumber(at(v, 'lastSeason')),
			lastEpisode: readOptionalNumber(at(v, 'lastEpisode')),
		}),
	};
}

/** A list field: absent when it is no list at all (an empty list stays, it can mean "looked, found none"). */
const listOf = (v: unknown): string[] | undefined => (Array.isArray(v) ? readStringList(v) : undefined);

function readEntry(v: unknown): EntryCache {
	const seasons = Array.isArray(at(v, 'seasons')) ? readList(at(v, 'seasons'), readSeason) : undefined;
	const type = at(v, 'tmdbMediaType');
	return defined<EntryCache>({
		trailerUrl: readOptionalString(at(v, 'trailerUrl')),
		director: listOf(at(v, 'director')),
		cast: listOf(at(v, 'cast')),
		studio: listOf(at(v, 'studio')),
		communityRating: readOptionalNumber(at(v, 'communityRating')),
		communityVotes: readOptionalNumber(at(v, 'communityVotes')),
		communitySource: readOptionalString(at(v, 'communitySource')),
		communityRatingLastFetched: readOptionalString(at(v, 'communityRatingLastFetched')),
		collectionId: readOptionalNumber(at(v, 'collectionId')),
		seasons,
		tmdbId: readOptionalNumber(at(v, 'tmdbId')),
		tmdbMediaType: type === 'movie' || type === 'tv' ? type : undefined,
		malId: readOptionalNumber(at(v, 'malId')),
		anilistId: readOptionalNumber(at(v, 'anilistId')),
		apiCheck: readApiCheck(at(v, 'apiCheck')),
		airing: readAiring(at(v, 'airing')),
	});
}

/** Every record under an id becomes an entry; anything else under an id is no entry and is dropped. */
export function readCache(v: unknown): Record<string, EntryCache> {
	const out: Record<string, EntryCache> = {};
	if (!isRecord(v)) return out;
	for (const [id, value] of Object.entries(v)) {
		if (isRecord(value)) out[id] = readEntry(value);
	}
	return out;
}

function readDaily(v: unknown): RecommendedDaily | undefined {
	const date = at(v, 'date');
	const ids = at(v, 'ids');
	return typeof date === 'string' && Array.isArray(ids) ? { date, ids: readStringList(ids) } : undefined;
}

function readCollapsed(v: unknown): Record<string, number[]> | undefined {
	if (!isRecord(v)) return undefined;
	return Object.fromEntries(Object.entries(v).map(([id, seasons]) => [id, readList(seasons, readOptionalNumber)]));
}

function readImported(v: unknown): LocalData['ui']['watchlogImport'] {
	const out: NonNullable<LocalData['ui']['watchlogImport']> = {};
	for (const kind of ['original', 'fork'] as const) {
		const outcome = at(v, kind);
		if (outcome === 'imported' || outcome === 'declined') out[kind] = outcome;
	}
	return out;
}

/** The ui state of data.json: the fields this version knows are read, any other key is kept as stored. */
export function readUi(v: unknown): LocalData['ui'] {
	const pinned = at(v, 'pinnedGroup');
	return {
		...readRecord(v),
		// set even when unreadable (as undefined), so a wrong-typed stored value cannot stay behind
		collapsedSeasons: readCollapsed(at(v, 'collapsedSeasons')),
		pinnedGroup: typeof pinned === 'string' || pinned === null ? pinned : undefined,
		recommendedDaily: readDaily(at(v, 'recommendedDaily')),
		gamesRecommendedDaily: readDaily(at(v, 'gamesRecommendedDaily')),
		watchlogImport: at(v, 'watchlogImport') === undefined ? undefined : readImported(at(v, 'watchlogImport')),
	};
}
