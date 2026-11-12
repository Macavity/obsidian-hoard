import type { AirtimeRecurrence, EntryAirtime, Season, TitleOverrides, HoardTitle } from '../types';
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

export function titleFromProperties(id: string, properties: Record<string, unknown>, cache: EntryCache | undefined): Decoded<HoardTitle> {
	const r = new Reader(properties);
	const c = cache ?? {};
	const status = r.str(C.status) ?? 'Plan to watch';
	const externalLink = r.str(C.url) ?? '';

	// seasons: note override wins over cache
	let seasons: Season[] = [];
	let seasonsOverride = false;
	const seasonLines = r.list(T.seasons);
	if (seasonLines && seasonLines.length > 0) {
		seasons = parseSeasonLines(seasonLines) ?? [];
		seasonsOverride = seasons.length > 0;
		if (!seasonsOverride) r.invalid.push(T.seasons);
	}
	if (!seasonsOverride) seasons = (c.seasons ?? []).map((s) => ({ ...s, skippedEpisodes: [] }));

	const total = r.num(T.totalEpisodes) ?? seasons.reduce((n, s) => n + s.episodes, 0);
	const movie = isMovie(seasons, total);

	const title: HoardTitle = {
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
		totalEpisodes: total,
		episodeDuration: r.num(T.runtime) ?? 0,
		releaseDate: r.date(C.releaseDate),
		externalLink,
		seasons,
		watchedEpisodes: [],
	};
	if (seasonsOverride) title.seasonsOverride = true;

	// cache fields
	// the note's `Cover` wins (set below); the cache only marks 'none' (the API has no poster)
	if (c.posterUrl === 'none') title.posterUrl = 'none';
	if (c.trailerUrl !== undefined) title.trailerUrl = c.trailerUrl;
	if (c.director) title.director = c.director;
	if (c.cast) title.cast = c.cast;
	if (c.studio) title.studio = c.studio;
	if (c.communityRating !== undefined) title.communityRating = c.communityRating;
	if (c.communityVotes !== undefined) title.communityVotes = c.communityVotes;
	if (c.communitySource !== undefined) title.communitySource = c.communitySource as HoardTitle['communitySource'];
	if (c.communityRatingLastFetched !== undefined) title.communityRatingLastFetched = c.communityRatingLastFetched;
	if (c.collectionId !== undefined) title.collectionId = c.collectionId;
	if (c.tmdbId !== undefined) title.tmdbId = c.tmdbId;
	if (c.tmdbMediaType !== undefined) title.tmdbMediaType = c.tmdbMediaType;
	if (c.malId !== undefined) title.malId = c.malId;
	if (c.anilistId !== undefined) title.anilistId = c.anilistId;

	// identity from externalId (fallback: link) wins over cached ids
	const ext = identityOf(r, properties, externalLink);
	if (ext) {
		const n = Number(ext.id);
		if (ext.source === 'tmdb' && ext.kind && !isNaN(n)) {
			title.tmdbId = n;
			title.tmdbMediaType = ext.kind === 'movie' ? 'movie' : 'tv';
		} else if (ext.source === 'mal' && !isNaN(n)) title.malId = n;
		else if (ext.source === 'anilist' && !isNaN(n)) title.anilistId = n;
		else if (ext.source === 'imdb' && !externalLink) title.externalLink = `https://www.imdb.com/title/${ext.id}`;
	}

	// progress: movies are carried by status; without seasons an implicit S01 unless a refill is pending
	if (movie) {
		if (status === 'Completed') title.watchedEpisodes = [1];
	} else {
		// a pending refill maps nothing: every ref stays unmapped and the note's text untouched
		const mapping = seasonsPending(title, c.apiCheck?.seasons?.result) ? seasons : mappingSeasons(title);
		const implicit = mapping !== seasons;
		const watchedText = r.str(T.watchedEpisodes);
		if (watchedText?.trim()) {
			const refs = parseEpisodeRange(watchedText, mapping);
			if (refs) {
				title.watchedEpisodes = toAbsolute(refs, mapping);
				const unmapped = outsideSeasons(refs, mapping);
				if (unmapped.length > 0) title.unmappedWatched = unmapped;
			} else r.invalid.push(T.watchedEpisodes);
		}
		const skippedText = r.str(T.skippedEpisodes);
		if (skippedText?.trim()) {
			const refs = parseEpisodeRange(skippedText, mapping);
			if (!refs) r.invalid.push(T.skippedEpisodes);
			else {
				// the implicit season is not stored on the title: its skips ride along unmapped
				const unmapped = implicit ? refs : outsideSeasons(refs, seasons);
				if (unmapped.length > 0) title.unmappedSkipped = unmapped;
				if (!implicit) {
					for (const ref of refs) {
						const season = seasons[ref.season - 1];
						if (season && ref.episode <= season.episodes) season.skippedEpisodes = [...(season.skippedEpisodes ?? []), ref.episode];
					}
				}
			}
		}
	}

	if (r.bool(T.pinned)) title.pinned = true;
	const favorite = r.bool(C.favorite);
	if (favorite !== undefined) title.favorite = favorite;
	const dateFavorited = r.str(C.dateFavorited);
	if (dateFavorited) title.dateFavorited = dateFavorited;
	if (r.bool(T.maybe)) title.maybe = true;
	const groups = nonEmpty(r.list(C.groups));
	if (groups) title.groups = groups;

	// the poster is a plain note field (E12); other API fields in the note are user overrides (E9)
	const poster = r.str(C.cover);
	if (poster) title.posterUrl = poster;
	const manualTrailer = r.str(T.trailer);
	if (manualTrailer) title.manualTrailerUrl = manualTrailer;
	const overrides: TitleOverrides = {};
	for (const { field, prop } of CREDIT_FIELDS) {
		const names = nonEmpty(r.list(prop));
		if (names) overrides[field] = names;
	}
	const communityRating = r.num(T.communityRating);
	if (communityRating !== undefined) overrides.communityRating = communityRating;
	const communityVotes = r.num(T.communityVotes);
	if (communityVotes !== undefined) overrides.communityVotes = communityVotes;
	const communitySource = r.str(T.communitySource);
	if (communitySource) overrides.communitySource = communitySource as TitleOverrides['communitySource'];
	if (Object.keys(overrides).length > 0) title.overrides = overrides;

	// user-added credits
	const manualDirector = nonEmpty(r.list(T.addedDirector));
	if (manualDirector) title.manualDirector = manualDirector;
	const manualCast = nonEmpty(r.list(T.addedCast));
	if (manualCast) title.manualCast = manualCast;
	const manualStudio = nonEmpty(r.list(T.addedStudio));
	if (manualStudio) title.manualStudio = manualStudio;

	// airtime
	const rec = r.str(A.recurrence);
	if (rec !== undefined) {
		if ((RECURRENCES as string[]).includes(rec)) {
			const airtime: EntryAirtime = { recurrence: rec as AirtimeRecurrence };
			const day = r.num(A.day);
			if (day !== undefined) airtime.day = day;
			const time = r.str(A.time);
			if (time !== undefined) airtime.time = time;
			const season = r.num(A.season);
			if (season !== undefined) airtime.season = season;
			const episode = r.num(A.episode);
			if (episode !== undefined) airtime.episode = episode;
			const ack = r.str(A.acknowledged);
			if (ack !== undefined) airtime.acknowledged = ack;
			title.airtime = airtime;
		} else r.invalid.push(A.recurrence);
	}

	return { entry: title, invalidFields: [...new Set(r.invalid)] };
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
