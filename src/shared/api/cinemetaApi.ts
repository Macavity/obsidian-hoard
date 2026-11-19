import { httpsOrEmpty } from './httpsUrl';
import type { HoardTitle, MediaSearchResult, Season } from '../../modules/watchlist/exports';
import { at, readList, readOptionalNumber, readRecord, readString, readStringList } from '../domain/read';

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

export type CinemetaKind = 'movie' | 'series';
type Raw = Record<string, unknown>;

/** Movie or TV only when the type says so (custom types stay unknown); for Cinemeta, which has no multi-search. */
export function explicitMediaKind(title: Pick<HoardTitle, 'type'>): 'movie' | 'tv' | null {
	if (title.type === 'Movie') return 'movie';
	return title.type === 'TV Show' || title.type === 'TvShow' ? 'tv' : null;
}

/** Movie or TV from the type, else from the episode count; null when neither says. */
export function titleMediaKind(title: Pick<HoardTitle, 'type' | 'totalEpisodes'>): 'movie' | 'tv' | null {
	const explicit = explicitMediaKind(title);
	if (explicit) return explicit;
	if (title.totalEpisodes === 1) return 'movie';
	return title.totalEpisodes > 1 ? 'tv' : null;
}

export function cinemetaSearchUrl(kind: CinemetaKind, query: string): string {
	return `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
}

export function cinemetaMetaUrl(kind: CinemetaKind, imdbId: string): string {
	return `${CINEMETA_BASE}/meta/${kind}/${imdbId}.json`;
}

function fullDate(v: unknown): string {
	const head = readString(v).slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
}

function startYear(v: unknown): string {
	return /^(\d{4})/.exec(readString(v))?.[1] ?? '';
}

/** "49 min" -> 49, "2h 5min" -> 125, anything else -> 0. */
function parseRuntime(v: unknown): number {
	const m = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*$/i.exec(readString(v));
	return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
}

function baseResult(raw: Raw, kind: CinemetaKind): MediaSearchResult | null {
	const id = readString(raw.id);
	if (!/^tt\d+$/.test(id)) return null;
	return {
		imdbId: id,
		title: readString(raw.name),
		mediaType: kind === 'movie' ? 'movie' : 'tv',
		episodes: 0,
		episodeDuration: 0,
		// search rows carry only releaseInfo ("1999", "2008–2013"): keep the start year, like OMDb rows
		releaseDate: fullDate(raw.released) || startYear(raw.releaseInfo),
		url: `https://www.imdb.com/title/${id}/`,
		seasons: [],
		posterUrl: httpsOrEmpty(readString(raw.poster)),
	};
}

export function mapCinemetaSearch(json: unknown, kind: CinemetaKind, year: string, limit: number): MediaSearchResult[] {
	const wantYear = /^\d{4}$/.test(year);
	const rows: MediaSearchResult[] = [];
	for (const raw of readList(at(json, 'metas'), (entry) => readRecord(entry))) {
		if (rows.length >= limit) break;
		if (wantYear && !readString(raw.releaseInfo).startsWith(year)) continue;
		const row = baseResult(raw, kind);
		if (row) rows.push(row);
	}
	return rows;
}

function buildSeasons(videos: unknown): Season[] {
	const counts = new Map<number, number>();
	for (const v of readList(videos, (item) => item)) {
		const season = readOptionalNumber(at(v, 'season'));
		if (season === undefined || !Number.isInteger(season) || season < 1) continue;
		counts.set(season, (counts.get(season) ?? 0) + 1);
	}
	let offset = 0;
	return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([n, episodes]) => {
		const season = { name: `Season ${n}`, episodes, offset };
		offset += episodes;
		return season;
	});
}

/**
 * Cinemeta answers an IMDb id requested under the wrong kind with an unrelated title
 * (a movie for a series id, a foreign series for a movie id). Genuine records always carry a
 * top-level `year`; the foreign ones only have `releaseInfo`. No year means not our record.
 */
export function mapCinemetaMeta(json: unknown, kind: CinemetaKind): MediaSearchResult | null {
	const raw = readRecord(at(json, 'meta'));
	const base = baseResult(raw, kind);
	if (!base || !readString(raw.year)) return null;
	const seasons = kind === 'series' ? buildSeasons(raw.videos) : [];
	return {
		...base,
		episodes: kind === 'movie' ? 1 : seasons.reduce((sum, s) => sum + s.episodes, 0),
		episodeDuration: parseRuntime(raw.runtime),
		seasons,
		cast: readStringList(raw.cast),
		director: readStringList(raw.director),
		studio: [],
	};
}
