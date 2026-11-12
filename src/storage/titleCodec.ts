import type { AirtimeRecurrence, Season, TitleOverrides, HoardTitle } from '../types';
import type { ApiCheckResult, Decoded, EntryCache, EpisodeRef, ExternalId } from './storageTypes';
import { MAX_EPISODE, formatEpisodeRange, fromAbsolute, outsideSeasons, parseEpisodeRange, toAbsolute } from './episodeRange';
import { externalIdFromLink, formatExternalId, parseExternalId } from './externalId';
import { AIRTIME_PROPS as A, COMMON_PROPS as C, TITLE_PROPS as T } from './properties';

const RECURRENCES: readonly AirtimeRecurrence[] = ['once', 'daily', 'weekly', 'monthly'];
const CREDIT_FIELDS = [
	{ field: 'director', prop: T.director },
	{ field: 'cast', prop: T.cast },
	{ field: 'studio', prop: T.studio },
] as const;

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

const nonEmpty = <T>(v: T[] | undefined): T[] | undefined => (v && v.length > 0 ? v : undefined);

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

/** Drops keys whose value is undefined, so an optional field is absent instead of present-and-undefined. */
function defined<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
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

/** Frontmatter fields for a title; keys are the frozen property names. `notes` is not included. */
export function titleToProperties(t: HoardTitle, progress: number, seasonsPending = false): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	out[C.name] = t.title;
	out[C.type] = t.type;
	out[C.status] = t.status;
	out[T.priority] = t.priority;
	if (t.review) out[T.review] = t.review;
	out[C.rating] = t.rating;
	out[T.progress] = progress;
	out[T.totalEpisodes] = t.totalEpisodes;
	out[T.runtime] = t.episodeDuration;
	out[C.dateStarted] = t.dateStarted;
	out[C.dateFinished] = t.dateFinished;
	out[C.dateAdded] = t.dateAdded;
	out[C.dateModified] = t.dateModified;
	if (t.releaseDate) out[C.releaseDate] = t.releaseDate;
	if (t.malId !== undefined) out[T.malId] = t.malId;
	if (t.anilistId !== undefined) out[T.anilistId] = t.anilistId;
	// API values live in the cache; only the user's overrides are written (E9)
	const o = t.overrides;
	if (o?.communityRating !== undefined) out[T.communityRating] = o.communityRating;
	if (o?.communityVotes !== undefined) out[T.communityVotes] = o.communityVotes;
	if (o?.communitySource) out[T.communitySource] = o.communitySource;
	for (const { field, prop } of CREDIT_FIELDS) {
		const names = o?.[field];
		if (names && names.length > 0) out[prop] = names;
	}
	if (t.posterUrl && t.posterUrl !== 'none') out[C.cover] = t.posterUrl;
	if (t.manualTrailerUrl?.trim()) out[T.trailer] = t.manualTrailerUrl;
	if (t.externalLink) out[C.url] = t.externalLink;
	if (t.pinned) out[T.pinned] = true;
	if (t.favorite) out[C.favorite] = true;
	if (t.dateFavorited) out[C.dateFavorited] = t.dateFavorited;

	const ext = identityFor(t);
	if (ext) out[C.externalId] = formatExternalId(ext);
	if (t.groups && t.groups.length > 0) out[C.groups] = t.groups;
	if (t.maybe) out[T.maybe] = true;

	// progress: movies are carried by status; while a season refill is pending the note's text is left alone
	const mapping = mappingSeasons(t);
	if (!isMovie(t.seasons, t.totalEpisodes) && !seasonsPending && mapping.length > 0) {
		out[T.watchedEpisodes] = formatEpisodeRange([...fromAbsolute(t.watchedEpisodes, mapping), ...(t.unmappedWatched ?? [])]);
		const skipped: EpisodeRef[] = [...(t.unmappedSkipped ?? [])];
		t.seasons.forEach((s, i) => {
			for (const episode of s.skippedEpisodes ?? []) skipped.push({ season: i + 1, episode });
		});
		if (skipped.length > 0) out[T.skippedEpisodes] = formatEpisodeRange(skipped);
	}
	if (t.seasonsOverride) out[T.seasons] = t.seasons.map((s) => `${s.name}: ${s.episodes}`);

	if (t.manualDirector?.length) out[T.addedDirector] = t.manualDirector;
	if (t.manualCast?.length) out[T.addedCast] = t.manualCast;
	if (t.manualStudio?.length) out[T.addedStudio] = t.manualStudio;

	const a = t.airtime;
	if (a) {
		out[A.recurrence] = a.recurrence;
		if (a.day !== undefined) out[A.day] = a.day;
		if (a.time !== undefined) out[A.time] = a.time;
		if (a.season !== undefined) out[A.season] = a.season;
		if (a.episode !== undefined) out[A.episode] = a.episode;
		if (a.acknowledged !== undefined) out[A.acknowledged] = a.acknowledged;
	}
	return out;
}

/** Cache keys titleToCache owns; everything else in a cache entry (apiCheck, airing, …) is kept on sync. */
export const TITLE_CACHE_KEYS = [
	'posterUrl', 'trailerUrl', 'director', 'cast', 'studio', 'communityRating', 'communityVotes', 'communitySource',
	'communityRatingLastFetched', 'collectionId', 'tmdbId', 'tmdbMediaType', 'malId', 'anilistId', 'seasons',
] as const satisfies readonly (keyof EntryCache)[];

/** API-derived fields that live in data.json (posters only as the 'none' marker); seasons only when not overridden in the note. */
export function titleToCache(t: HoardTitle): EntryCache {
	const c: EntryCache = {};
	if (t.posterUrl === 'none') c.posterUrl = t.posterUrl;
	if (t.trailerUrl !== undefined) c.trailerUrl = t.trailerUrl;
	if (t.director) c.director = t.director;
	if (t.cast) c.cast = t.cast;
	if (t.studio) c.studio = t.studio;
	if (t.communityRating !== undefined) c.communityRating = t.communityRating;
	if (t.communityVotes !== undefined) c.communityVotes = t.communityVotes;
	if (t.communitySource) c.communitySource = t.communitySource;
	if (t.communityRatingLastFetched !== undefined) c.communityRatingLastFetched = t.communityRatingLastFetched;
	if (t.collectionId !== undefined) c.collectionId = t.collectionId;
	if (t.tmdbId !== undefined) c.tmdbId = t.tmdbId;
	if (t.tmdbMediaType) c.tmdbMediaType = t.tmdbMediaType;
	if (t.malId !== undefined) c.malId = t.malId;
	if (t.anilistId !== undefined) c.anilistId = t.anilistId;
	if (!t.seasonsOverride && t.seasons.length > 0) {
		c.seasons = t.seasons.map((s) => ({ name: s.name, episodes: s.episodes, offset: s.offset }));
	}
	return c;
}
