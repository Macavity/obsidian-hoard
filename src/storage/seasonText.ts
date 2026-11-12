import type { Season } from '../types';

/**
 * The text form of a season: "Name: N", optionally followed by the episodes to skip, " (5,8,33-37)".
 * The Seasons property of a title note and the seasons box of the edit form both use it. Reading is
 * kept apart from judging: a line is read as written here, and each caller decides which bounds apply.
 */

/** One entry of a skip list as written. A single episode has `from === to`; an unreadable number is NaN. */
export interface SkipRange {
	from: number;
	to: number;
}

export interface SeasonLine {
	name: string;
	episodes: number;
	skipped: SkipRange[];
}

const LINE = /^(.+?):\s*(\d+)(?:\s*\(([^)]+)\))?/;

/** Entries of "5,8,33-37". An entry with one dash is a range, one without is a single episode, any other is dropped. */
function skipRanges(spec: string): SkipRange[] {
	return spec.split(',').map((s) => s.trim()).filter(Boolean).flatMap((entry): SkipRange[] => {
		const [from, to, ...more] = entry.split('-').map((n) => parseInt(n, 10));
		if (from === undefined || more.length > 0) return [];
		return [{ from, to: to ?? from }];
	});
}

/** Reads "Name: N" with an optional skip list; null when the line is not of that form. */
export function parseSeasonLine(line: string): SeasonLine | null {
	const m = line.trim().match(LINE);
	if (!m || !m[1] || !m[2]) return null;
	return { name: m[1].trim(), episodes: parseInt(m[2], 10), skipped: m[3] ? skipRanges(m[3]) : [] };
}

/** The episodes the ranges name, sorted and unique. A range that runs backwards or has an unreadable end names none. */
export function skippedEpisodes(ranges: SkipRange[]): number[] {
	const all = ranges.flatMap(({ from, to }) => (from <= to ? Array.from({ length: to - from + 1 }, (_, k) => from + k) : []));
	return [...new Set(all)].sort((a, b) => a - b);
}

/** Seasons from their lines; each season starts where the ones before it end. */
export function seasonsOf(lines: SeasonLine[]): Season[] {
	const seasons: Season[] = [];
	let offset = 0;
	for (const line of lines) {
		seasons.push({ name: line.name, episodes: line.episodes, offset, skippedEpisodes: skippedEpisodes(line.skipped) });
		offset += line.episodes;
	}
	return seasons;
}

/** [5, 8, 33, 34, 35] -> "5,8,33-35". */
export function formatSkipSpec(episodes: number[]): string {
	const runs: [first: number, last: number][] = [];
	for (const n of [...new Set(episodes)].sort((a, b) => a - b)) {
		const run = runs[runs.length - 1];
		if (run && run[1] + 1 === n) run[1] = n;
		else runs.push([n, n]);
	}
	return runs.map(([first, last]) => (first === last ? String(first) : `${first}-${last}`)).join(',');
}

/** The inverse of parseSeasonLine: "Name: N", with " (skip list)" when episodes are skipped. */
export function formatSeasonLine(season: Season): string {
	const skipped = season.skippedEpisodes ?? [];
	const head = `${season.name}: ${season.episodes}`;
	return skipped.length > 0 ? `${head} (${formatSkipSpec(skipped)})` : head;
}
