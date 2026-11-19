// Pure window maths for VirtualGrid: which item range is materialised for a scroll position, and
// how to get from the previous window to the next. DOM-free so it is unit-testable.

export interface GridWindow {
	firstRow: number;
	totalRows: number;
	firstIndex: number;
	lastIndex: number;
}

/** Item window (inclusive) for a scroll position. `lastIndex < firstIndex` means empty. */
export function computeGridWindow(
	localScrollTop: number,
	viewportHeight: number,
	metrics: { cols: number; rowHeight: number },
	itemCount: number,
	overscanRows: number,
): GridWindow {
	const { cols, rowHeight } = metrics;
	const totalRows = Math.ceil(itemCount / cols);
	const firstRow = Math.max(0, Math.floor(localScrollTop / rowHeight) - overscanRows);
	const lastRow = Math.min(totalRows - 1, Math.ceil((localScrollTop + viewportHeight) / rowHeight) + overscanRows);

	// grid entirely outside the viewport (± overscan) — empty window
	if (lastRow < firstRow || itemCount === 0) return { firstRow: 0, totalRows, firstIndex: 0, lastIndex: -1 };
	return {
		firstRow,
		totalRows,
		firstIndex: firstRow * cols,
		lastIndex: Math.min(itemCount - 1, (lastRow + 1) * cols - 1),
	};
}

export type WindowChange =
	| { kind: 'none' }
	| { kind: 'replace' }
	| {
			kind: 'shift';
			trimStart: number;
			trimEnd: number;
			prepend: [number, number] | null;
			append: [number, number] | null;
	  };

export interface IndexRange {
	first: number;
	last: number;
}

/** How to turn the materialised `prev` window into `next`. (-1, -1) is the never-rendered state. */
export function planWindowChange(prev: IndexRange, next: IndexRange): WindowChange {
	if (next.first === prev.first && next.last === prev.last) return { kind: 'none' };

	const isInitial = prev.first === -1 && prev.last === -1;
	const anyEmpty = prev.last < prev.first || next.last < next.first;
	const overlaps = next.first <= prev.last && next.last >= prev.first;
	if (isInitial || anyEmpty || !overlaps) return { kind: 'replace' };

	return {
		kind: 'shift',
		trimStart: Math.max(0, next.first - prev.first),
		trimEnd: Math.max(0, prev.last - next.last),
		prepend: next.first < prev.first ? [next.first, Math.min(prev.first - 1, next.last)] : null,
		append: next.last > prev.last ? [Math.max(prev.last + 1, next.first), next.last] : null,
	};
}
