import { describe, expect, it } from 'vitest';
import { rowOffsets, visibleRowRange, windowDelta } from '../../src/design-system/rowWindow';

describe('rowOffsets', () => {
	it('accumulates heights with a gap between rows', () => {
		expect(rowOffsets([68, 100, 68], 8)).toEqual({ offsets: [0, 76, 184], total: 252 });
	});
	it('is empty for no rows', () => {
		expect(rowOffsets([], 8)).toEqual({ offsets: [], total: 0 });
	});
	it('adds no trailing gap for a single row', () => {
		expect(rowOffsets([50], 8)).toEqual({ offsets: [0], total: 50 });
	});
});

describe('visibleRowRange', () => {
	const offsets = [0, 76, 184];
	const heights = [68, 100, 68];
	it('picks only the rows overlapping the window', () => {
		expect(visibleRowRange(offsets, heights, 70, 180, 44)).toEqual({ start: 1, end: 1 });
	});
	it('covers all rows for a window around everything', () => {
		expect(visibleRowRange(offsets, heights, -100, 1000, 44)).toEqual({ start: 0, end: 2 });
	});
	it('is 0..0 for an empty list', () => {
		expect(visibleRowRange([], [], 0, 500, 44)).toEqual({ start: 0, end: 0 });
	});
	it('uses the fallback height for a missing height', () => {
		expect(visibleRowRange([0, 10], [], 20, 30, 44)).toEqual({ start: 0, end: 1 });
	});
});

describe('windowDelta', () => {
	it('removes rows that left and adds rows that entered', () => {
		expect(windowDelta([3, 4, 5], 4, 7)).toEqual({ remove: [3], add: [6, 7] });
	});
	it('adds the whole range when nothing is rendered', () => {
		expect(windowDelta([], 0, 2)).toEqual({ remove: [], add: [0, 1, 2] });
	});
});
