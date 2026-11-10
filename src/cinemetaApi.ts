import { httpsOrEmpty } from './httpsUrl';
import type { MediaSearchResult, Season } from './types';

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

export type CinemetaKind = 'movie' | 'series';
type Raw = Record<string, unknown>;

export function cinemetaSearchUrl(kind: CinemetaKind, query: string): string {
	return `${CINEMETA_BASE}/catalog/${kind}/top/search=${encodeURIComponent(query)}.json`;
}

export function cinemetaMetaUrl(kind: CinemetaKind, imdbId: string): string {
	return `${CINEMETA_BASE}/meta/${kind}/${imdbId}.json`;
}

function asObject(v: unknown): Raw | null {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null;
}

function str(v: unknown): string {
	return typeof v === 'string' ? v : '';
}

function strList(v: unknown): string[] {
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function fullDate(v: unknown): string {
	const head = str(v).slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
}

/** "49 min" -> 49, "2h 5min" -> 125, anything else -> 0. */
function parseRuntime(v: unknown): number {
	const m = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?\s*$/i.exec(str(v));
	return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : 0;
}

function baseResult(raw: Raw, kind: CinemetaKind): MediaSearchResult | null {
	const id = str(raw.id);
	if (!/^tt\d+$/.test(id)) return null;
	return {
		imdbId: id,
		title: str(raw.name),
		mediaType: kind === 'movie' ? 'movie' : 'tv',
		episodes: 0,
		episodeDuration: 0,
		releaseDate: fullDate(raw.released),
		url: `https://www.imdb.com/title/${id}/`,
		seasons: [],
		posterUrl: httpsOrEmpty(str(raw.poster)),
	};
}

export function mapCinemetaSearch(json: unknown, kind: CinemetaKind, year: string, limit: number): MediaSearchResult[] {
	const metas = asObject(json)?.metas;
	if (!Array.isArray(metas)) return [];
	const wantYear = /^\d{4}$/.test(year);
	const rows: MediaSearchResult[] = [];
	for (const entry of metas) {
		if (rows.length >= limit) break;
		const raw = asObject(entry);
		if (!raw || (wantYear && !str(raw.releaseInfo).startsWith(year))) continue;
		const row = baseResult(raw, kind);
		if (row) rows.push(row);
	}
	return rows;
}

function buildSeasons(videos: unknown): Season[] {
	const counts = new Map<number, number>();
	for (const v of Array.isArray(videos) ? videos : []) {
		const season = asObject(v)?.season;
		if (typeof season !== 'number' || !Number.isInteger(season) || season < 1) continue;
		counts.set(season, (counts.get(season) ?? 0) + 1);
	}
	let offset = 0;
	return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([n, episodes]) => {
		const season = { name: `Season ${n}`, episodes, offset };
		offset += episodes;
		return season;
	});
}

export function mapCinemetaMeta(json: unknown, kind: CinemetaKind): MediaSearchResult | null {
	const raw = asObject(asObject(json)?.meta);
	const base = raw && baseResult(raw, kind);
	if (!raw || !base) return null;
	const seasons = kind === 'series' ? buildSeasons(raw.videos) : [];
	return {
		...base,
		episodes: kind === 'movie' ? 1 : seasons.reduce((sum, s) => sum + s.episodes, 0),
		episodeDuration: parseRuntime(raw.runtime),
		seasons,
		cast: strList(raw.cast),
		director: strList(raw.director),
		studio: [],
	};
}
