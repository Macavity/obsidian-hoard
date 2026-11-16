import { describe, expect, it } from 'vitest';
import { sortByFavorited } from '../src/types';

const item = (id: string, dateFavorited?: string) => ({ id, dateFavorited });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('sortByFavorited', () => {
	it('puts the newest favorite first', () => {
		const sorted = sortByFavorited([item('a', '2026-01-01'), item('c', '2026-03-01'), item('b', '2026-02-01')]);
		expect(ids(sorted)).toEqual(['c', 'b', 'a']);
	});

	it('sinks items without a stamp to the end in their incoming order', () => {
		const sorted = sortByFavorited([item('x'), item('a', '2026-01-01'), item('y'), item('b', '2026-02-01')]);
		expect(ids(sorted)).toEqual(['b', 'a', 'x', 'y']);
	});

	it('keeps equal stamps in their incoming order', () => {
		const sorted = sortByFavorited([item('p', '2026-01-01'), item('q', '2026-01-01'), item('r', '2026-01-01')]);
		expect(ids(sorted)).toEqual(['p', 'q', 'r']);
	});
});
