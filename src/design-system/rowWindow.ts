/** Pure window math for virtualised row lists; no DOM. */

/** Cumulative top offset of every row (a gap between rows, none after the last) and the total height. */
export function rowOffsets(heights: readonly number[], gap: number): { offsets: number[]; total: number } {
	const offsets: number[] = [];
	let total = 0;
	for (let i = 0; i < heights.length; i++) {
		offsets.push(total);
		total += heights[i] ?? 0;
		if (i < heights.length - 1) total += gap;
	}
	return { offsets, total };
}

/**
 * The rows overlapping [top, bottom]: `start` is the first row whose bottom edge is past `top`
 * (binary search), `end` the last row from there whose top edge is before `bottom`.
 */
export function visibleRowRange(
	offsets: readonly number[],
	heights: readonly number[],
	top: number,
	bottom: number,
	fallbackHeight: number,
): { start: number; end: number } {
	let lo = 0;
	let hi = offsets.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if ((offsets[mid] ?? 0) + (heights[mid] ?? fallbackHeight) <= top) {
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	const start = Math.max(0, lo);
	let end = start;
	for (let i = start; i < offsets.length; i++) {
		if ((offsets[i] ?? 0) >= bottom) break;
		end = i;
	}
	return { start, end };
}

/** Which rendered row indices to drop and which in [first, last] still need building. */
export function windowDelta(
	rendered: Iterable<number>,
	first: number,
	last: number,
): { remove: number[]; add: number[] } {
	const have = new Set(rendered);
	const remove: number[] = [];
	for (const idx of have) {
		if (idx < first || idx > last) remove.push(idx);
	}
	const add: number[] = [];
	for (let i = first; i <= last; i++) {
		if (!have.has(i)) add.push(i);
	}
	return { remove, add };
}
