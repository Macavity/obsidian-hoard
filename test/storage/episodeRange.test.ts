import { describe, it, expect } from 'vitest';
import { parseEpisodeRange, formatEpisodeRange, toAbsolute, fromAbsolute, outsideSeasons } from '../../src/storage/episodeRange';

const seasons = [{ name: 'Season 1', episodes: 12, offset: 0 }, { name: 'Season 2', episodes: 10, offset: 12 }];

describe('episodeRange', () => {
	it('round-trips canonical form', () => {
		const s = 'S01E01-E12, S02E01-E03';
		expect(formatEpisodeRange(parseEpisodeRange(s)!)).toBe(s);
	});

	it('is tolerant', () => {
		expect(formatEpisodeRange(parseEpisodeRange('S1E1-S1E3,s02e05')!)).toBe('S01E01-E03, S02E05');
	});

	it('supports cross-season ranges when season sizes are known', () => {
		expect(formatEpisodeRange(parseEpisodeRange('S01E11-S02E02', seasons)!)).toBe('S01E11-E12, S02E01-E02');
		expect(parseEpisodeRange('S01E11-S02E02')).toBeNull();
	});

	it('returns [] for empty and null for garbage', () => {
		expect(parseEpisodeRange('')).toEqual([]);
		expect(parseEpisodeRange('1-12')).toBeNull();
	});

	it('converts to and from absolute numbers', () => {
		const refs = parseEpisodeRange('S01E12, S02E01')!;
		expect(toAbsolute(refs, seasons)).toEqual([12, 13]);
		expect(fromAbsolute([12, 13], seasons)).toEqual(refs);
	});

	it('rejects episode numbers above 10000', () => {
		expect(parseEpisodeRange('S01E10001')).toBeNull();
		expect(parseEpisodeRange('S01E01-E99999999')).toBeNull();
		expect(parseEpisodeRange('S01E10000')).toEqual([{ season: 1, episode: 10000 }]);
		expect(parseEpisodeRange('S01E10001', seasons)).toBeNull();
		// beyond a known season's length is kept (ongoing season, stale cache)
		expect(parseEpisodeRange('S01E13', seasons)).toEqual([{ season: 1, episode: 13 }]);
		expect(parseEpisodeRange('S01E11-E13', seasons)).toHaveLength(3);
		expect(outsideSeasons([{ season: 1, episode: 13 }, { season: 1, episode: 12 }], seasons)).toEqual([{ season: 1, episode: 13 }]);
		// a season the list does not know yet is not checked against a count
		expect(parseEpisodeRange('S03E40', seasons)).toEqual([{ season: 3, episode: 40 }]);
	});
});

describe('parseEpisodeRange edge cases', () => {
	it('accepts lower case and unpadded numbers, and returns refs sorted without duplicates', () => {
		expect(parseEpisodeRange('s1e2, S01E1, s01e02, S02E01')).toEqual([
			{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 2, episode: 1 },
		]);
	});

	it('skips empty parts between commas', () => {
		expect(parseEpisodeRange('S01E01,, S01E02, ')).toEqual([{ season: 1, episode: 1 }, { season: 1, episode: 2 }]);
	});

	it('rejects the whole input when one part is garbage', () => {
		expect(parseEpisodeRange('S01E01, x')).toBeNull();
		expect(parseEpisodeRange('S01E01 S01E02')).toBeNull();
		expect(parseEpisodeRange('S01E01-')).toBeNull();
	});

	it('expands a range inside one season, with or without the season repeated', () => {
		const three = [{ season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 1, episode: 3 }];
		expect(parseEpisodeRange('S01E01-E03')).toEqual(three);
		expect(parseEpisodeRange('S01E01-S01E03')).toEqual(three);
		expect(parseEpisodeRange('S01E02-E02')).toEqual([{ season: 1, episode: 2 }]);
	});

	it('rejects a range that runs backwards', () => {
		expect(parseEpisodeRange('S01E05-E03')).toBeNull();
		expect(parseEpisodeRange('S02E01-S01E05', seasons)).toBeNull();
	});

	it('expands a cross-season range through the known seasons', () => {
		expect(parseEpisodeRange('S01E11-S02E02', seasons)).toEqual([
			{ season: 1, episode: 11 }, { season: 1, episode: 12 }, { season: 2, episode: 1 }, { season: 2, episode: 2 },
		]);
	});

	it('rejects a cross-season range that leaves the known seasons at either end', () => {
		expect(parseEpisodeRange('S02E09-S03E01', seasons)).toBeNull();
		expect(parseEpisodeRange('S01E13-S02E02', seasons)).toBeNull();
		expect(parseEpisodeRange('S01E11-S02E11', seasons)).toBeNull();
		expect(parseEpisodeRange('S01E00-S02E01', seasons)).toBeNull();
	});

	it('applies the episode limit to both ends of a range', () => {
		expect(parseEpisodeRange('S01E01-E10001')).toBeNull();
		expect(parseEpisodeRange('S01E10001-E10002')).toBeNull();
		expect(parseEpisodeRange('S01E9999-E10000')).toEqual([{ season: 1, episode: 9999 }, { season: 1, episode: 10000 }]);
		expect(parseEpisodeRange('S01E01-S02E10001', seasons)).toBeNull();
	});
});

describe('formatEpisodeRange', () => {
	it('sorts, dedupes and collapses runs inside a season', () => {
		expect(formatEpisodeRange([
			{ season: 1, episode: 3 }, { season: 1, episode: 1 }, { season: 1, episode: 2 }, { season: 2, episode: 1 }, { season: 1, episode: 2 },
		])).toBe('S01E01-E03, S02E01');
	});

	it('does not join the end of one season to the start of the next', () => {
		expect(formatEpisodeRange([{ season: 1, episode: 12 }, { season: 2, episode: 1 }])).toBe('S01E12, S02E01');
		expect(formatEpisodeRange([{ season: 1, episode: 1 }, { season: 1, episode: 3 }])).toBe('S01E01, S01E03');
		expect(formatEpisodeRange([])).toBe('');
	});
});
