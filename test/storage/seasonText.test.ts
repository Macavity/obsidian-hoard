import { describe, expect, it } from 'vitest';
import { formatSeasonLine, formatSkipSpec, parseSeasonLine, seasonsOf, skippedEpisodes } from '../../src/storage/seasonText';

describe('parseSeasonLine', () => {
	it('reads the name and the episode count', () => {
		expect(parseSeasonLine('Season 1: 12')).toStrictEqual({ name: 'Season 1', episodes: 12, skipped: [] });
	});

	it('reads singles and ranges of the skip list as written', () => {
		expect(parseSeasonLine('S1: 40 (5,8,33-37)')).toStrictEqual({
			name: 'S1', episodes: 40, skipped: [{ from: 5, to: 5 }, { from: 8, to: 8 }, { from: 33, to: 37 }],
		});
	});

	it('tolerates spaces around every part', () => {
		expect(parseSeasonLine('  S1 :  4  ( 1 , 3-4 ) ')).toStrictEqual({
			name: 'S1', episodes: 4, skipped: [{ from: 1, to: 1 }, { from: 3, to: 4 }],
		});
	});

	it('keeps a colon inside the name and takes the count after the last one that fits', () => {
		expect(parseSeasonLine('Re: Zero: 25')).toMatchObject({ name: 'Re: Zero', episodes: 25 });
		expect(parseSeasonLine('2001: 3')).toMatchObject({ name: '2001', episodes: 3 });
	});

	it('is null for a line that is not "Name: N"', () => {
		expect(parseSeasonLine('garbage')).toBeNull();
		expect(parseSeasonLine('')).toBeNull();
		expect(parseSeasonLine(': 3')).toBeNull();
		expect(parseSeasonLine('S1: many')).toBeNull();
	});

	it('keeps an unreadable number as NaN and drops an entry with more than one dash', () => {
		expect(parseSeasonLine('S1: 12 (x,3-y,1-2-3,-5)')!.skipped).toStrictEqual([
			{ from: NaN, to: NaN }, { from: 3, to: NaN }, { from: NaN, to: 5 },
		]);
	});
});

describe('skippedEpisodes', () => {
	it('lists the episodes of every range, sorted and without duplicates', () => {
		expect(skippedEpisodes([{ from: 8, to: 8 }, { from: 2, to: 4 }, { from: 3, to: 3 }])).toEqual([2, 3, 4, 8]);
	});

	it('takes nothing from a range that runs backwards or has an unreadable end', () => {
		expect(skippedEpisodes([{ from: 9, to: 3 }, { from: NaN, to: 5 }, { from: 3, to: NaN }, { from: NaN, to: NaN }])).toEqual([]);
	});
});

describe('seasonsOf', () => {
	it('builds seasons with cumulative offsets', () => {
		expect(seasonsOf([
			{ name: 'S1', episodes: 12, skipped: [{ from: 5, to: 6 }] },
			{ name: 'S2', episodes: 3, skipped: [] },
			{ name: 'S3', episodes: 4, skipped: [] },
		])).toStrictEqual([
			{ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [5, 6] },
			{ name: 'S2', episodes: 3, offset: 12, skippedEpisodes: [] },
			{ name: 'S3', episodes: 4, offset: 15, skippedEpisodes: [] },
		]);
		expect(seasonsOf([])).toEqual([]);
	});
});

describe('formatSkipSpec', () => {
	it('collapses runs and keeps singles', () => {
		expect(formatSkipSpec([5, 8, 33, 34, 35])).toBe('5,8,33-35');
		expect(formatSkipSpec([1, 2])).toBe('1-2');
		expect(formatSkipSpec([7])).toBe('7');
		expect(formatSkipSpec([])).toBe('');
	});

	it('sorts and dedupes first', () => {
		expect(formatSkipSpec([12, 5, 8, 10, 11, 5])).toBe('5,8,10-12');
	});
});

describe('formatSeasonLine', () => {
	it('writes the skip list only when there is one', () => {
		expect(formatSeasonLine({ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [5, 6] })).toBe('S1: 12 (5-6)');
		expect(formatSeasonLine({ name: 'S2', episodes: 3, offset: 12, skippedEpisodes: [] })).toBe('S2: 3');
		expect(formatSeasonLine({ name: 'S3', episodes: 4, offset: 15 })).toBe('S3: 4');
	});

	it('is read back by parseSeasonLine', () => {
		const line = formatSeasonLine({ name: 'Re: Zero', episodes: 25, offset: 0, skippedEpisodes: [1, 2, 3, 9] });
		expect(seasonsOf([parseSeasonLine(line)!])).toStrictEqual([{ name: 'Re: Zero', episodes: 25, offset: 0, skippedEpisodes: [1, 2, 3, 9] }]);
	});
});
