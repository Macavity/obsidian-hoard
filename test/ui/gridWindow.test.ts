import { describe, expect, it } from 'vitest';
import { computeGridWindow, planWindowChange } from '../../src/design-system/gridWindow';

const m = { cols: 4, rowHeight: 100 };

describe('computeGridWindow', () => {
	it('windows the top of the grid with overscan', () => {
		expect(computeGridWindow(0, 300, m, 40, 2)).toEqual({ firstRow: 0, totalRows: 10, firstIndex: 0, lastIndex: 23 });
	});
	it('clamps the window at the end of the grid', () => {
		expect(computeGridWindow(1000, 300, m, 40, 2)).toEqual({ firstRow: 8, totalRows: 10, firstIndex: 32, lastIndex: 39 });
	});
	it('returns an empty window when the grid is outside the viewport', () => {
		expect(computeGridWindow(-5000, 300, m, 40, 2)).toEqual({ firstRow: 0, totalRows: 10, firstIndex: 0, lastIndex: -1 });
	});
	it('returns an empty window for zero items', () => {
		expect(computeGridWindow(0, 300, m, 0, 2)).toEqual({ firstRow: 0, totalRows: 0, firstIndex: 0, lastIndex: -1 });
	});
});

describe('planWindowChange', () => {
	it('replaces on the initial render', () => {
		expect(planWindowChange({ first: -1, last: -1 }, { first: 0, last: 23 })).toEqual({ kind: 'replace' });
	});
	it('does nothing for an identical window', () => {
		expect(planWindowChange({ first: 0, last: 23 }, { first: 0, last: 23 })).toEqual({ kind: 'none' });
	});
	it('shifts down: trims the top, appends at the bottom', () => {
		expect(planWindowChange({ first: 0, last: 23 }, { first: 8, last: 31 })).toEqual({
			kind: 'shift', trimStart: 8, trimEnd: 0, prepend: null, append: [24, 31],
		});
	});
	it('shifts up: trims the bottom, prepends at the top', () => {
		expect(planWindowChange({ first: 8, last: 31 }, { first: 0, last: 23 })).toEqual({
			kind: 'shift', trimStart: 0, trimEnd: 8, prepend: [0, 7], append: null,
		});
	});
	it('replaces adjacent windows', () => {
		expect(planWindowChange({ first: 0, last: 7 }, { first: 8, last: 15 })).toEqual({ kind: 'replace' });
	});
	it('replaces when the previous window was empty', () => {
		expect(planWindowChange({ first: 0, last: -1 }, { first: 0, last: 7 })).toEqual({ kind: 'replace' });
	});
});
