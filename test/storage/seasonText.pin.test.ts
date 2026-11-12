import { describe, expect, it } from 'vitest';
import { titleFromProperties } from '../../src/storage/titleCodec';

// Pins how the title codec reads the lines of the Seasons property ("Name: N" with an optional skip list).

const read = (lines: string[]) => {
	const { entry, invalidFields } = titleFromProperties('TV Show/X', { Seasons: lines }, undefined);
	return { seasons: entry.seasons, invalid: invalidFields };
};
const skipped = (line: string): number[] | undefined => read([line]).seasons[0]?.skippedEpisodes;
const REJECTED = { seasons: [], invalid: ['Seasons'] };

describe('Seasons property lines', () => {
	it('reads names, counts and skip lists, with cumulative offsets', () => {
		expect(read(['S1: 12 (5,8,10-11)', 'S2: 3'])).toStrictEqual({
			seasons: [
				{ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [5, 8, 10, 11] },
				{ name: 'S2', episodes: 3, offset: 12, skippedEpisodes: [] },
			],
			invalid: [],
		});
	});

	it('tolerates spaces and text after the count', () => {
		expect(read(['  S1 :  4  ( 1 , 3-4 ) ']).seasons).toStrictEqual([{ name: 'S1', episodes: 4, offset: 0, skippedEpisodes: [1, 3, 4] }]);
		expect(read(['S1: 12 episodes']).seasons).toStrictEqual([{ name: 'S1', episodes: 12, offset: 0, skippedEpisodes: [] }]);
	});

	it('keeps a colon inside the name', () => {
		expect(read(['Re: Zero: 25']).seasons[0]).toMatchObject({ name: 'Re: Zero', episodes: 25 });
		expect(read(['2001: 3']).seasons[0]).toMatchObject({ name: '2001', episodes: 3 });
	});

	it('sorts and dedupes the skip list', () => {
		expect(skipped('S1: 12 (4,2,2-3)')).toEqual([2, 3, 4]);
		expect(skipped('S1: 12 (0)')).toEqual([0]);
	});

	it('ignores a skip entry it cannot read', () => {
		expect(skipped('S1: 12 (x,7)')).toEqual([7]);
		expect(skipped('S1: 12 (9-3)')).toEqual([]);
		expect(skipped('S1: 12 (1-2-3)')).toEqual([]);
		expect(skipped('S1: 12 (-5)')).toEqual([]);
		expect(skipped('S1: 12 (3-x)')).toEqual([]);
	});

	it('skips a line that is not "Name: N"', () => {
		expect(read(['garbage', 'S1: 2']).seasons).toStrictEqual([{ name: 'S1', episodes: 2, offset: 0, skippedEpisodes: [] }]);
	});

	it('rejects all seasons when no line can be read', () => {
		expect(read(['garbage'])).toStrictEqual(REJECTED);
	});

	it('rejects all seasons when a skipped episode lies beyond the season', () => {
		expect(read(['S1: 3 (9)'])).toStrictEqual(REJECTED);
		expect(read(['S1: 3 (2-9)'])).toStrictEqual(REJECTED);
		expect(read(['S1: 12', 'S2: 3 (4)'])).toStrictEqual(REJECTED);
	});

	it('rejects on the end of a range even when the range itself is unreadable', () => {
		expect(read(['S1: 3 (9-5)'])).toStrictEqual(REJECTED);
		expect(read(['S1: 12 (x-20)'])).toStrictEqual(REJECTED);
	});

	it('rejects all seasons when a count exceeds the episode limit', () => {
		expect(read(['S1: 10001'])).toStrictEqual(REJECTED);
		expect(read(['S1: 10000']).seasons[0]).toMatchObject({ episodes: 10000 });
	});
});
