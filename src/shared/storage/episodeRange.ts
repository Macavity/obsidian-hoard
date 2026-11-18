import type { Season } from '../types';
import type { EpisodeRef } from './storageTypes';

// S01E01, s1e1, S01E01-E12 (same season), S01E11-S02E02 (cross-season, needs seasons)
const TOKEN = /^s(\d+)e(\d+)(?:-(?:s(\d+))?e(\d+))?$/i;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Upper bound for any episode number; guards range expansion against absurd input. */
export const MAX_EPISODE = 10_000;

/** Sorts and dedupes refs. */
function normalize(refs: EpisodeRef[]): EpisodeRef[] {
	const sorted = [...refs].sort((a, b) => a.season - b.season || a.episode - b.episode);
	const out: EpisodeRef[] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (!last || last.season !== r.season || last.episode !== r.episode) out.push(r);
	}
	return out;
}

/** Absolute episode number (1-based across all seasons), or undefined if out of range. */
function absOf(ref: EpisodeRef, seasons: Season[]): number | undefined {
	const season = seasons[ref.season - 1];
	if (!season || ref.episode < 1 || ref.episode > season.episodes) return undefined;
	const before = seasons.slice(0, ref.season - 1).reduce((sum, s) => sum + s.episodes, 0);
	return before + ref.episode;
}

/**
 * Parses "S01E01-E12, S02E05" into refs. Returns null on garbage, episode numbers above MAX_EPISODE or
 * cross-season ranges without (or beyond) seasons. Episodes beyond a known season's length parse fine.
 */
export function parseEpisodeRange(input: string, seasons?: Season[]): EpisodeRef[] | null {
	const out: EpisodeRef[] = [];
	for (const text of input.split(',').map((p) => p.trim()).filter(Boolean)) {
		const part = readPart(text);
		const refs = part && expandPart(part, seasons);
		if (!refs) return null;
		out.push(...refs);
	}
	return normalize(out);
}

/** One comma-separated part as written. A single episode is a range of one: `to === from`, `endSeason === season`. */
interface RangePart {
	season: number;
	from: number;
	endSeason: number;
	to: number;
}

/** Reads one part; null for garbage and for an episode number above MAX_EPISODE. */
function readPart(text: string): RangePart | null {
	const m = text.match(TOKEN);
	if (!m || m[1] === undefined || m[2] === undefined) return null;
	const season = parseInt(m[1], 10);
	const from = parseInt(m[2], 10);
	const to = m[4] === undefined ? from : parseInt(m[4], 10);
	const endSeason = m[3] === undefined ? season : parseInt(m[3], 10);
	return from > MAX_EPISODE || to > MAX_EPISODE ? null : { season, from, endSeason, to };
}

/**
 * The episodes a part names. Inside one season the numbers are taken as written; across seasons the
 * range runs through `seasons`. null when it runs backwards, or crosses seasons that are unknown.
 */
function expandPart(p: RangePart, seasons: Season[] | undefined): EpisodeRef[] | null {
	if (p.endSeason === p.season) {
		if (p.from > p.to) return null;
		return Array.from({ length: p.to - p.from + 1 }, (_, k) => ({ season: p.season, episode: p.from + k }));
	}
	if (!seasons) return null;
	const a = absOf({ season: p.season, episode: p.from }, seasons);
	const b = absOf({ season: p.endSeason, episode: p.to }, seasons);
	if (a === undefined || b === undefined || a > b) return null;
	return fromAbsolute(Array.from({ length: b - a + 1 }, (_, k) => a + k), seasons);
}

/** Formats refs canonically: sorted, deduped, consecutive runs per season collapsed. */
export function formatEpisodeRange(refs: EpisodeRef[]): string {
	const runs: string[] = [];
	let runStart: EpisodeRef | undefined;
	let prev: EpisodeRef | undefined;
	const flush = (): void => {
		if (!runStart || !prev) return;
		const head = `S${pad(runStart.season)}E${pad(runStart.episode)}`;
		runs.push(runStart.episode === prev.episode ? head : `${head}-E${pad(prev.episode)}`);
	};
	for (const r of normalize(refs)) {
		if (prev && prev.season === r.season && prev.episode + 1 === r.episode) {
			prev = r;
			continue;
		}
		flush();
		runStart = r;
		prev = r;
	}
	flush();
	return runs.join(', ');
}

/** Refs the list cannot map: unknown season (S02 while only S01 is known) or episode beyond the season's length. */
export function outsideSeasons(refs: EpisodeRef[], seasons: Season[]): EpisodeRef[] {
	return refs.filter((r) => absOf(r, seasons) === undefined);
}

/** Maps refs to absolute episode numbers; refs outside the known seasons are dropped. */
export function toAbsolute(refs: EpisodeRef[], seasons: Season[]): number[] {
	const nums = refs.map((r) => absOf(r, seasons)).filter((n): n is number => n !== undefined);
	return [...new Set(nums)].sort((a, b) => a - b);
}

/** Maps absolute episode numbers back to refs; numbers outside the known seasons are dropped. */
export function fromAbsolute(nums: number[], seasons: Season[]): EpisodeRef[] {
	const out: EpisodeRef[] = [];
	for (const n of [...new Set(nums)].sort((a, b) => a - b)) {
		let before = 0;
		seasons.forEach((s, i) => {
			if (n > before && n <= before + s.episodes) out.push({ season: i + 1, episode: n - before });
			before += s.episodes;
		});
	}
	return out;
}
