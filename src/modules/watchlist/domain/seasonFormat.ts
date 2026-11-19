import type { Season } from './model';

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
