import type { AirtimeRecurrence, EntryAirtime, Season, TitleOverrides, HoardTitle } from '../types';
import type { ApiCheckResult, Decoded, EntryCache, EpisodeRef, ExternalId, Fm } from './storageTypes';
import { MAX_EPISODE, formatEpisodeRange, fromAbsolute, outsideSeasons, parseEpisodeRange, toAbsolute } from './episodeRange';
import { externalIdFromLink, formatExternalId, parseExternalId } from './externalId';
import { AIRTIME_PROPS as A, COMMON_PROPS as C, TITLE_PROPS as T } from './properties';
import { defined, nonEmpty, optional } from './sharedHelpers';

const RECURRENCES: readonly AirtimeRecurrence[] = ['once', 'daily', 'weekly', 'monthly'];

/** Movie = a single "Movie" season, or no seasons and exactly one episode. */
export function isMovie(seasons: Season[], totalEpisodes: number): boolean {
	if (seasons.length === 1) return seasons[0]?.name === 'Movie';
	return seasons.length === 0 && totalEpisodes === 1;
}

/**
 * A series with an API identity but no seasons in note or cache, whose season fetch has not yet ended
 * in "not found" or "no key": its episodes cannot be mapped until the seasons arrive.
 */
export function seasonsPending(t: HoardTitle, seasonsCheck: ApiCheckResult | undefined): boolean {
	if (t.seasonsOverride || t.seasons.length > 0 || t.tmdbMediaType === 'movie') return false;
	if (isMovie(t.seasons, t.totalEpisodes)) return false;
	if (seasonsCheck === 'notfound' || seasonsCheck === 'nokey') return false;
	return !!t.tmdbId || !!t.malId || !!t.anilistId || externalIdFromLink(t.externalLink) !== null;
}

/** Seasons episodes map onto: the known ones, else one implicit "S01" of `totalEpisodes`. */
function mappingSeasons(t: HoardTitle): Season[] {
	if (t.seasons.length > 0) return t.seasons;
	return t.totalEpisodes > 0 ? [{ name: 'Season 1', episodes: t.totalEpisodes, offset: 0 }] : [];
}

/**
 * Parses "Name: N" lines (optional " (skip_spec)") into seasons; offsets are cumulative. null when a
 * count or skipped episode is out of bounds.
 */
function parseSeasonLines(lines: string[]): Season[] | null {
	const seasons: Season[] = [];
	let offset = 0;
	for (const line of lines) {
		const m = line.trim().match(/^(.+?):\s*(\d+)(?:\s*\(([^)]+)\))?/);
		if (!m || !m[1] || !m[2]) continue;
		const episodes = parseInt(m[2], 10);
		if (episodes > MAX_EPISODE) return null;
		const skippedEpisodes = m[3] ? parseSkipSpec(m[3], episodes) : [];
		if (!skippedEpisodes) return null;
		seasons.push({ name: m[1].trim(), episodes, offset, skippedEpisodes });
		offset += episodes;
	}
	return seasons;
}

/** "5,8,33-37" -> [5, 8, 33..37]; null when a number exceeds the season's `episodes`. */
function parseSkipSpec(spec: string, episodes: number): number[] | null {
	const out: number[] = [];
	for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
		const bits = part.split('-');
		if (bits.length === 2) {
			const from = parseInt(bits[0] ?? '', 10);
			const to = parseInt(bits[1] ?? '', 10);
			if (to > episodes) return null;
			if (!isNaN(from) && !isNaN(to) && from <= to) for (let i = from; i <= to; i++) out.push(i);
		} else if (bits.length === 1) {
			const n = parseInt(part, 10);
			if (n > episodes) return null;
			if (!isNaN(n)) out.push(n);
		}
	}
	return [...new Set(out)].sort((x, y) => x - y);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Field reader that records unreadable values and falls back to a default. */
class Reader {
	invalid: string[] = [];
	constructor(private fm: Record<string, unknown>) {}

	private bad(key: string): undefined {
		this.invalid.push(key);
		return undefined;
	}

	str(key: string): string | undefined {
		const v = this.fm[key];
		if (v === undefined || v === null) return undefined;
		if (typeof v === 'string') return v;
		if (v instanceof Date) return v.toISOString();
		if (isNum(v)) return String(v);
		return this.bad(key);
	}

	num(key: string): number | undefined {
		const v = this.fm[key];
		if (v === undefined || v === null) return undefined;
		return isNum(v) ? v : this.bad(key);
	}

	bool(key: string): boolean | undefined {
		const v = this.fm[key];
		if (v === undefined || v === null) return undefined;
		return typeof v === 'boolean' ? v : this.bad(key);
	}

	list(key: string): string[] | undefined {
		const v = this.fm[key];
		if (v === undefined || v === null) return undefined;
		if (typeof v === 'string') return v.trim() ? [v] : [];
		if (Array.isArray(v) && v.every((x) => typeof x === 'string' || isNum(x))) return v.map(String);
		return this.bad(key);
	}

	/** nullable date string: null/absent -> null */
	date(key: string): string | null {
		return this.str(key) ?? null;
	}
}

function identityOf(r: Reader, fm: Record<string, unknown>, link: string): ExternalId | null {
	const rawId = fm[C.externalId];
	const idText = typeof rawId === 'string' ? rawId : undefined;
	if (idText !== undefined) {
		const parsed = parseExternalId(idText.trim());
		if (parsed) return parsed;
		r.invalid.push(C.externalId);
	}
	return link ? externalIdFromLink(link) : null;
}

const isRecurrence = (v: string): v is AirtimeRecurrence => (RECURRENCES as readonly string[]).includes(v);

/** Every non-optional key of HoardTitle. */
type RequiredTitle = { [K in keyof HoardTitle as undefined extends HoardTitle[K] ? never : K]: HoardTitle[K] };

/** Seasons: lines in the note win over the cache; unreadable lines are reported and the cache is used. */
function decodeSeasons(r: Reader, c: EntryCache): { seasons: Season[]; seasonsOverride: boolean } {
	const lines = r.list(T.seasons);
	if (lines && lines.length > 0) {
		const fromNote = parseSeasonLines(lines) ?? [];
		if (fromNote.length > 0) return { seasons: fromNote, seasonsOverride: true };
		r.invalid.push(T.seasons);
	}
	// copies: the decoded title never shares season objects with the cache
	return { seasons: (c.seasons ?? []).map((s) => ({ ...s, skippedEpisodes: [] })), seasonsOverride: false };
}

/** The fields every title has, read from the note with their defaults. */
function coreFields(r: Reader, id: string, status: string, externalLink: string, seasons: Season[]): RequiredTitle {
	const totalEpisodes = r.num(T.totalEpisodes) ?? seasons.reduce((n, s) => n + s.episodes, 0);
	return {
		id,
		title: r.str(C.name) ?? id.split('/').pop() ?? id,
		type: r.str(C.type) ?? 'TV Show',
		status,
		// absent key = Medium; an explicit empty value means no priority
		priority: r.str(T.priority) ?? 'Medium',
		review: r.str(T.review) ?? '',
		rating: r.num(C.rating) ?? 0,
		notes: '',
		dateStarted: r.date(C.dateStarted),
		dateFinished: r.date(C.dateFinished),
		dateAdded: r.str(C.dateAdded) ?? '',
		dateModified: r.str(C.dateModified) ?? '',
		totalEpisodes,
		episodeDuration: r.num(T.runtime) ?? 0,
		releaseDate: r.date(C.releaseDate),
		externalLink,
		seasons,
		watchedEpisodes: [],
	};
}

/** API data from the cache. Of the poster only the 'none' marker lives there; the note's `Cover` wins later. */
function cachedApiFields(c: EntryCache): Partial<HoardTitle> {
	return defined({
		posterUrl: c.posterUrl === 'none' ? 'none' : undefined,
		trailerUrl: c.trailerUrl,
		director: c.director || undefined,
		cast: c.cast || undefined,
		studio: c.studio || undefined,
		communityRating: c.communityRating,
		communityVotes: c.communityVotes,
		communitySource: c.communitySource,
		communityRatingLastFetched: c.communityRatingLastFetched,
		collectionId: c.collectionId,
		tmdbId: c.tmdbId,
		tmdbMediaType: c.tmdbMediaType,
		malId: c.malId,
		anilistId: c.anilistId,
	});
}

type IdentityFields = Partial<Pick<HoardTitle, 'tmdbId' | 'tmdbMediaType' | 'malId' | 'anilistId' | 'externalLink'>>;

/** API ids from the note's identity (External ID, else the URL); they win over cached ids. */
function identityFields(ext: ExternalId | null, externalLink: string): IdentityFields {
	if (!ext) return {};
	// an IMDb id is no API id: it only supplies the link a note without URL lacks
	if (ext.source === 'imdb') return externalLink ? {} : { externalLink: `https://www.imdb.com/title/${ext.id}` };
	const n = Number(ext.id);
	if (isNaN(n)) return {};
	if (ext.source === 'tmdb') return ext.kind ? { tmdbId: n, tmdbMediaType: ext.kind === 'movie' ? 'movie' : 'tv' } : {};
	if (ext.source === 'mal') return { malId: n };
	if (ext.source === 'anilist') return { anilistId: n };
	return {};
}

type WatchedFields = Pick<HoardTitle, 'watchedEpisodes'> & Partial<Pick<HoardTitle, 'unmappedWatched'>>;
type SkippedFields = Pick<HoardTitle, 'seasons'> & Partial<Pick<HoardTitle, 'unmappedSkipped'>>;

function watchedFields(r: Reader, mapping: Season[]): WatchedFields {
	const text = r.str(T.watchedEpisodes);
	if (!text?.trim()) return { watchedEpisodes: [] };
	const refs = parseEpisodeRange(text, mapping);
	if (!refs) {
		r.invalid.push(T.watchedEpisodes);
		return { watchedEpisodes: [] };
	}
	return { watchedEpisodes: toAbsolute(refs, mapping), ...defined({ unmappedWatched: nonEmpty(outsideSeasons(refs, mapping)) }) };
}

/** `seasons` with the skipped episodes of `refs` added; seasons without a new skip are returned as they are. */
function withSkipped(seasons: Season[], refs: EpisodeRef[]): Season[] {
	return seasons.map((season, i) => {
		const added = refs.filter((ref) => ref.season === i + 1 && ref.episode <= season.episodes).map((ref) => ref.episode);
		return added.length > 0 ? { ...season, skippedEpisodes: [...(season.skippedEpisodes ?? []), ...added] } : season;
	});
}

function skippedFields(r: Reader, seasons: Season[], mapping: Season[]): SkippedFields {
	const text = r.str(T.skippedEpisodes);
	if (!text?.trim()) return { seasons };
	const refs = parseEpisodeRange(text, mapping);
	if (!refs) {
		r.invalid.push(T.skippedEpisodes);
		return { seasons };
	}
	// the implicit season is not stored on the title: its skips ride along unmapped
	if (mapping !== seasons) return { seasons, ...defined({ unmappedSkipped: nonEmpty(refs) }) };
	return { seasons: withSkipped(seasons, refs), ...defined({ unmappedSkipped: nonEmpty(outsideSeasons(refs, seasons)) }) };
}

/** Progress: movies are carried by status; a series maps its episode ranges onto the seasons. */
function progressFields(r: Reader, t: HoardTitle, seasonsCheck: ApiCheckResult | undefined): WatchedFields & SkippedFields {
	if (isMovie(t.seasons, t.totalEpisodes)) return { watchedEpisodes: t.status === 'Completed' ? [1] : [], seasons: t.seasons };
	// a pending refill maps nothing: every ref stays unmapped and the note's text untouched.
	// without seasons an implicit S01 is used, unless a refill is pending
	const mapping = seasonsPending(t, seasonsCheck) ? t.seasons : mappingSeasons(t);
	return { ...watchedFields(r, mapping), ...skippedFields(r, t.seasons, mapping) };
}

/** API fields the user set in the note; they win over the cached values and are written back (E9). */
function overridesOf(r: Reader): TitleOverrides | undefined {
	const overrides: TitleOverrides = defined({
		director: nonEmpty(r.list(T.director)),
		cast: nonEmpty(r.list(T.cast)),
		studio: nonEmpty(r.list(T.studio)),
		communityRating: r.num(T.communityRating),
		communityVotes: r.num(T.communityVotes),
		communitySource: r.str(T.communitySource) || undefined,
	});
	return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/** What the user set in the note beyond the core fields. The poster is a plain note field (E12). */
function userFields(r: Reader): Partial<HoardTitle> {
	return defined({
		pinned: r.bool(T.pinned) || undefined,
		favorite: r.bool(C.favorite),
		dateFavorited: r.str(C.dateFavorited) || undefined,
		maybe: r.bool(T.maybe) || undefined,
		groups: nonEmpty(r.list(C.groups)),
		posterUrl: r.str(C.cover) || undefined,
		manualTrailerUrl: r.str(T.trailer) || undefined,
		overrides: overridesOf(r),
		manualDirector: nonEmpty(r.list(T.addedDirector)),
		manualCast: nonEmpty(r.list(T.addedCast)),
		manualStudio: nonEmpty(r.list(T.addedStudio)),
	});
}

/** The manual schedule; an unknown recurrence is reported and sets none. */
function airtimeField(r: Reader): Partial<Pick<HoardTitle, 'airtime'>> {
	const recurrence = r.str(A.recurrence);
	if (recurrence === undefined) return {};
	if (!isRecurrence(recurrence)) {
		r.invalid.push(A.recurrence);
		return {};
	}
	const rest = defined({ day: r.num(A.day), time: r.str(A.time), season: r.num(A.season), episode: r.num(A.episode), acknowledged: r.str(A.acknowledged) });
	return { airtime: { recurrence, ...rest } };
}

/** A title from its note's properties and its cache entry. The note wins wherever both carry a field. */
export function titleFromProperties(id: string, properties: Record<string, unknown>, cache: EntryCache | undefined): Decoded<HoardTitle> {
	const r = new Reader(properties);
	const c = cache ?? {};
	const status = r.str(C.status) ?? 'Plan to watch';
	const externalLink = r.str(C.url) ?? '';
	const { seasons, seasonsOverride } = decodeSeasons(r, c);
	const base: HoardTitle = {
		...coreFields(r, id, status, externalLink, seasons),
		...defined({ seasonsOverride: seasonsOverride || undefined }),
		...cachedApiFields(c),
		...identityFields(identityOf(r, properties, externalLink), externalLink),
	};
	const entry: HoardTitle = { ...base, ...progressFields(r, base, c.apiCheck?.seasons?.result), ...userFields(r), ...airtimeField(r) };
	return { entry, invalidFields: [...new Set(r.invalid)] };
}

/** Primary identity for `externalId`: API ids first (anime prefers MAL/AniList), then the link. */
function identityFor(t: HoardTitle): ExternalId | null {
	const tmdb = (): ExternalId | null =>
		t.tmdbId !== undefined && t.tmdbMediaType ? { source: 'tmdb', kind: t.tmdbMediaType, id: String(t.tmdbId) } : null;
	const mal = (): ExternalId | null => (t.malId !== undefined ? { source: 'mal', kind: 'anime', id: String(t.malId) } : null);
	const anilist = (): ExternalId | null => (t.anilistId !== undefined ? { source: 'anilist', kind: 'anime', id: String(t.anilistId) } : null);
	const order = t.type === 'Anime' ? [mal, anilist, tmdb] : [tmdb, mal, anilist];
	for (const fn of order) {
		const id = fn();
		if (id) return id;
	}
	return t.externalLink ? externalIdFromLink(t.externalLink) : null;
}

/** The properties every title note has, plus the ones written once they carry a value. */
function coreProps(t: HoardTitle, progress: number): Fm {
	return {
		[C.name]: t.title,
		[C.type]: t.type,
		[C.status]: t.status,
		[T.priority]: t.priority,
		...optional(T.review, t.review),
		[C.rating]: t.rating,
		[T.progress]: progress,
		[T.totalEpisodes]: t.totalEpisodes,
		[T.runtime]: t.episodeDuration,
		[C.dateStarted]: t.dateStarted,
		[C.dateFinished]: t.dateFinished,
		[C.dateAdded]: t.dateAdded,
		[C.dateModified]: t.dateModified,
		...optional(C.releaseDate, t.releaseDate),
		...defined({ [T.malId]: t.malId, [T.anilistId]: t.anilistId }),
	};
}

/** API values live in the cache; only the user's overrides are written (E9). */
function overrideProps(o: TitleOverrides | undefined): Fm {
	return {
		...defined({ [T.communityRating]: o?.communityRating, [T.communityVotes]: o?.communityVotes }),
		...optional(T.communitySource, o?.communitySource),
		...optional(T.director, nonEmpty(o?.director)),
		...optional(T.cast, nonEmpty(o?.cast)),
		...optional(T.studio, nonEmpty(o?.studio)),
	};
}

/** Links, flags and the identity of the note. A poster of 'none' is a cache marker and stays out. */
function linkAndFlagProps(t: HoardTitle): Fm {
	const identity = identityFor(t);
	return {
		...optional(C.cover, t.posterUrl !== 'none' && t.posterUrl),
		...optional(T.trailer, t.manualTrailerUrl?.trim() && t.manualTrailerUrl),
		...optional(C.url, t.externalLink),
		...optional(T.pinned, t.pinned),
		...optional(C.favorite, t.favorite),
		...optional(C.dateFavorited, t.dateFavorited),
		...optional(C.externalId, identity && formatExternalId(identity)),
		...optional(C.groups, nonEmpty(t.groups)),
		...optional(T.maybe, t.maybe),
	};
}

/** Watched and skipped episodes as ranges over `mapping`; refs outside the known seasons ride along unchanged. */
function episodeProps(t: HoardTitle, mapping: Season[]): Fm {
	const skipped: EpisodeRef[] = [
		...(t.unmappedSkipped ?? []),
		...t.seasons.flatMap((s, i) => (s.skippedEpisodes ?? []).map((episode) => ({ season: i + 1, episode }))),
	];
	return {
		[T.watchedEpisodes]: formatEpisodeRange([...fromAbsolute(t.watchedEpisodes, mapping), ...(t.unmappedWatched ?? [])]),
		...optional(T.skippedEpisodes, skipped.length > 0 && formatEpisodeRange(skipped)),
	};
}

/** Progress: movies are carried by status; while a season refill is pending the note's text is left alone. */
function progressProps(t: HoardTitle, refillPending: boolean): Fm {
	const mapping = mappingSeasons(t);
	const mapped = !isMovie(t.seasons, t.totalEpisodes) && !refillPending && mapping.length > 0;
	return {
		...(mapped ? episodeProps(t, mapping) : {}),
		...optional(T.seasons, t.seasonsOverride && t.seasons.map((s) => `${s.name}: ${s.episodes}`)),
	};
}

function addedCreditProps(t: HoardTitle): Fm {
	return {
		...optional(T.addedDirector, nonEmpty(t.manualDirector)),
		...optional(T.addedCast, nonEmpty(t.manualCast)),
		...optional(T.addedStudio, nonEmpty(t.manualStudio)),
	};
}

/** Unlike `airtimeProps` in readingCodec.ts, an empty time or acknowledgement is a value here and is written. */
function titleAirtimeProps(a: EntryAirtime | undefined): Fm {
	if (!a) return {};
	return {
		[A.recurrence]: a.recurrence,
		...defined({ [A.day]: a.day, [A.time]: a.time, [A.season]: a.season, [A.episode]: a.episode, [A.acknowledged]: a.acknowledged }),
	};
}

/** The properties of a title's note; keys are the frozen property names. `notes` is not included. */
export function titleToProperties(t: HoardTitle, progress: number, seasonsPending = false): Record<string, unknown> {
	return {
		...coreProps(t, progress),
		...overrideProps(t.overrides),
		...linkAndFlagProps(t),
		...progressProps(t, seasonsPending),
		...addedCreditProps(t),
		...titleAirtimeProps(t.airtime),
	};
}

/** Cache keys titleToCache owns; everything else in a cache entry (apiCheck, airing, …) is kept on sync. */
export const TITLE_CACHE_KEYS = [
	'posterUrl', 'trailerUrl', 'director', 'cast', 'studio', 'communityRating', 'communityVotes', 'communitySource',
	'communityRatingLastFetched', 'collectionId', 'tmdbId', 'tmdbMediaType', 'malId', 'anilistId', 'seasons',
] as const satisfies readonly (keyof EntryCache)[];

/** API-derived fields that live in data.json (posters only as the 'none' marker); seasons only when not overridden in the note. */
export function titleToCache(t: HoardTitle): EntryCache {
	const cachedSeasons = !t.seasonsOverride && t.seasons.length > 0;
	return defined({
		posterUrl: t.posterUrl === 'none' ? t.posterUrl : undefined,
		trailerUrl: t.trailerUrl,
		director: t.director || undefined,
		cast: t.cast || undefined,
		studio: t.studio || undefined,
		communityRating: t.communityRating,
		communityVotes: t.communityVotes,
		communitySource: t.communitySource || undefined,
		communityRatingLastFetched: t.communityRatingLastFetched,
		collectionId: t.collectionId,
		tmdbId: t.tmdbId,
		tmdbMediaType: t.tmdbMediaType || undefined,
		malId: t.malId,
		anilistId: t.anilistId,
		seasons: cachedSeasons ? t.seasons.map((s) => ({ name: s.name, episodes: s.episodes, offset: s.offset })) : undefined,
	});
}
