// VirtualGrid — shared window-diffing core for the virtualised poster grids: the Cards view's
// single full-height grid and each Rows-view "By type" grid. One instance owns one spacer (whose
// height reserves the full scroll extent) and one absolutely-positioned grid (holding only the
// materialised rows). The caller owns the scroll listener, geometry reads and the poster observer;
// this only diffs the visible window and mutates the DOM.
//
// Deliberately Obsidian-free (plain DOM) so it can run standalone in the headless-Chromium CLS
// harness.

import { computeGridWindow, planWindowChange, type GridWindow, type WindowChange } from './gridWindow';

export interface GridMetrics {
	cols: number;
	cardWidth: number;
	cardHeight: number;
	rowHeight: number;
}

const GRID_GAP = 12;
const MIN_CARD_WIDTH = 160;
const OVERSCAN_ROWS = 2;

/**
 * "Card size" step → minimum card width. Index = step + 3 (steps run −3..+3); step 0 is the 160px
 * default (the pre-2.3 scale survives as the lower steps, so the old 140px default is exactly one
 * step down). Spaced ~15% apart so each step reliably changes the column count — cards stretch to
 * fill their column, so a smaller nudge would often change nothing.
 */
const CARD_SIZE_WIDTHS = [100, 120, 140, 160, 185, 215, 250] as const;

/** Resolve a stored card-size step (may be missing/out-of-range) to its minimum card width. */
export function cardSizeToMinWidth(step: number | undefined): number {
	const idx = Math.round(step ?? 0) + 3;
	return CARD_SIZE_WIDTHS[Math.max(0, Math.min(CARD_SIZE_WIDTHS.length - 1, idx))] ?? MIN_CARD_WIDTH;
}

/**
 * Column/card geometry for a poster grid of the given container width — mirrors the CSS
 * `minmax(<min>, 1fr)` auto-fill columns and the 2:3 ratio. `minCardWidth` comes from the card-size
 * setting (default 160px).
 */
export function computeGridMetrics(containerWidth: number, minCardWidth = MIN_CARD_WIDTH): GridMetrics {
	const cols = Math.max(1, Math.floor((containerWidth + GRID_GAP) / (minCardWidth + GRID_GAP)));
	const cardWidth = (containerWidth - GRID_GAP * (cols - 1)) / cols;
	const cardHeight = cardWidth * 1.5;
	return { cols, cardWidth, cardHeight, rowHeight: cardHeight + GRID_GAP };
}

/**
 * Publish the grid-mirrored card width on a Rows scroll container — the `--hoard-rows-view-card-width` the
 * shelf cards size from. Shelves track the *computed* grid card width, not the raw minimum, so
 * shelf and grid cards match at any pane width. No-ops on an unchanged value (this runs on every
 * scroll tick) and on degenerate widths (a hidden pane measures 0).
 */
export function setRowsCardWidth(scroll: HTMLElement, cardWidth: number): void {
	if (!(cardWidth > 0)) return;
	const px = `${Math.round(cardWidth)}px`;
	if (appliedRowsCardWidth.get(scroll) === px) return;
	appliedRowsCardWidth.set(scroll, px);
	scroll.setCssProps({ '--hoard-rows-view-card-width': px });
}

export interface VirtualGridCallbacks {
	/** Build the card for item `index`; return its root element (not attached). */
	buildItem(index: number, cardWidth: number, cardHeight: number): HTMLElement | null;
	/** Detach one previously built card (unobserve from the poster observer, remove from the DOM). */
	removeItem(el: HTMLElement): void;
}

export interface VirtualGridOptions {
	/** CSS custom properties the stylesheet reads (Cards-view names by default; Reading passes its own). */
	colsVar?: string;
	cardHeightVar?: string;
	offsetVar?: string;
}

export class VirtualGrid {
	private spacer: HTMLElement;
	private grid: HTMLElement;
	private cb: VirtualGridCallbacks;
	private colsVar: string;
	private cardHeightVar: string;
	private offsetVar: string;
	readonly itemCount: number;

	// materialised item window (inclusive). (-1, -1) = never rendered; an empty window (grid fully
	// outside the viewport) is (0, -1).
	private lastFirst = -1;
	private lastLast = -1;
	// last-applied layout-write inputs — used to skip the spacer/padding/CSS-var writes when neither
	// the scroll offset nor the geometry changed, so a same-window scroll tick doesn't dirty layout
	private lastFirstRow = -1;
	private lastCols = -1;
	private lastCardHeight = -1;
	private lastTotalRows = -1;

	constructor(
		spacer: HTMLElement,
		grid: HTMLElement,
		itemCount: number,
		cb: VirtualGridCallbacks,
		options?: VirtualGridOptions,
	) {
		this.spacer = spacer;
		this.grid = grid;
		this.itemCount = itemCount;
		this.cb = cb;
		this.colsVar = options?.colsVar ?? '--hoard-card-grid-columns';
		this.cardHeightVar = options?.cardHeightVar ?? '--hoard-card-height';
		this.offsetVar = options?.offsetVar ?? '--hoard-card-grid-offset';
	}

	/**
	 * Reserve the grid's full height for the given geometry without rendering anything. Lets the Rows
	 * view size every spacer up-front, so offsets measured before the first update() are already final
	 * (zero CLS).
	 */
	reserveHeight(metrics: GridMetrics): void {
		const totalRows = Math.ceil(this.itemCount / metrics.cols);
		this.spacer.setCssProps({ '--hoard-card-grid-spacer-height': `${totalRows * metrics.rowHeight}px` });
	}

	/**
	 * Re-window the grid for the given scroll position. `localScrollTop` is relative to the grid's own
	 * top edge — negative while the grid is below the viewport, past its height once scrolled by (both
	 * happen in the Rows view, where several grids share one scroller). Returns true when the
	 * materialised card set changed, so the caller can re-register the poster observer.
	 */
	update(localScrollTop: number, viewportHeight: number, metrics: GridMetrics): boolean {
		const win = computeGridWindow(localScrollTop, viewportHeight, metrics, this.itemCount, OVERSCAN_ROWS);
		const change = planWindowChange(
			{ first: this.lastFirst, last: this.lastLast },
			{ first: win.firstIndex, last: win.lastIndex },
		);

		this.applyLayout(win, metrics); // skips its own writes when layout inputs are unchanged
		if (change.kind === 'none') return false;

		this.lastFirst = win.firstIndex;
		this.lastLast = win.lastIndex;
		return this.applyChange(change, win, metrics);
	}

	/**
	 * Write spacer height / grid offset / CSS vars, skipping the writes when none of their inputs
	 * changed (rowHeight is cardHeight plus a fixed gap) — they'd be no-ops that still dirty layout.
	 */
	private applyLayout(win: GridWindow, metrics: GridMetrics): void {
		const { cols, cardHeight, rowHeight } = metrics;
		const layoutUnchanged =
			win.firstRow === this.lastFirstRow &&
			cols === this.lastCols &&
			cardHeight === this.lastCardHeight &&
			win.totalRows === this.lastTotalRows;
		if (layoutUnchanged) return;

		this.spacer.setCssProps({ '--hoard-card-grid-spacer-height': `${win.totalRows * rowHeight}px` });
		// Offset the grid with padding-top (through a custom property), NOT transform: translateY. With a transform, every row advance
		// (remove top row + append bottom row + transform bump in one frame) makes Chromium's layout-shift
		// tracker report a full row of stationary cards as shifted (previousRect 0×0 → poster rect) — the
		// CLS that climbed on every scroll. Padding replaces the removed row in layout, so each surviving
		// card's rect is literally unchanged. (Verified in a headless-Chromium harness: transform ≈ 0.14
		// CLS per row advance; padding-top = 0. ReadingTab avoids it differently, by rebuilding the whole
		// window — inserted-only content is never counted as a shift.)
		this.grid.setCssProps({
			[this.offsetVar]: `${win.firstRow * rowHeight}px`,
			[this.colsVar]: String(cols),
			[this.cardHeightVar]: `${cardHeight}px`,
		});
		this.lastFirstRow = win.firstRow;
		this.lastCols = cols;
		this.lastCardHeight = cardHeight;
		this.lastTotalRows = win.totalRows;
	}

	/** Apply a planned window change to the DOM. Returns true when the card set changed. */
	private applyChange(change: WindowChange, win: GridWindow, metrics: GridMetrics): boolean {
		if (change.kind === 'none') return false;
		if (change.kind === 'replace') {
			this.removeAllCards();
			this.grid.appendChild(this.buildRange([win.firstIndex, win.lastIndex], metrics));
			return true;
		}

		// incremental update — trim from the edges, then add what's new
		for (let i = 0; i < change.trimStart; i++) {
			const el = this.grid.firstElementChild;
			if (!el?.instanceOf(HTMLElement)) break;
			this.cb.removeItem(el);
		}
		for (let i = 0; i < change.trimEnd; i++) {
			const el = this.grid.lastElementChild;
			if (!el?.instanceOf(HTMLElement)) break;
			this.cb.removeItem(el);
		}
		if (change.prepend) this.grid.insertBefore(this.buildRange(change.prepend, metrics), this.grid.firstChild);
		if (change.append) this.grid.appendChild(this.buildRange(change.append, metrics));
		return true;
	}

	private buildRange([from, to]: [number, number], metrics: GridMetrics): DocumentFragment {
		const fragment = createFragment();
		for (let i = from; i <= to; i++) {
			const card = this.cb.buildItem(i, metrics.cardWidth, metrics.cardHeight);
			if (card) fragment.appendChild(card);
		}
		return fragment;
	}

	private removeAllCards(): void {
		let el = this.grid.firstElementChild;
		while (el) {
			const next = el.nextElementSibling;
			if (el.instanceOf(HTMLElement)) this.cb.removeItem(el);
			el = next;
		}
	}
}

// last width written per scroll container, so the per-scroll-tick call never reads the DOM back
const appliedRowsCardWidth = new WeakMap<HTMLElement, string>();
