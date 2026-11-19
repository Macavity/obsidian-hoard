import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualScroller } from '../src/design-system/VirtualScroller';
import type { GridMetrics, VirtualGrid } from '../src/design-system/VirtualGrid';

const metricsOf = (rowHeight: number): GridMetrics => ({ rowHeight }) as GridMetrics;

let resizeCb: () => void;
const disconnect = vi.fn();

function scrollEl(width: number, height: number): HTMLElement {
	const el = document.createElement('div');
	Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
	Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
	return el;
}

function fakeGrid(changed = true) {
	return { reserveHeight: vi.fn(), update: vi.fn(() => changed) };
}

beforeEach(() => {
	vi.stubGlobal('ResizeObserver', class {
		constructor(cb: () => void) { resizeCb = cb; }
		observe(): void {}
		disconnect = disconnect;
	});
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 1; });
	vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function build(scroll: HTMLElement, metrics = vi.fn(() => metricsOf(100)), changed = true) {
	const onWindowChanged = vi.fn();
	const onScrollPos = vi.fn();
	const scroller = new VirtualScroller({ scroll, metrics, onWindowChanged, onScrollPos });
	const grid = fakeGrid(changed);
	scroller.addSection(grid as unknown as VirtualGrid, document.createElement('div'));
	return { scroller, grid, metrics, onWindowChanged, onScrollPos };
}

describe('VirtualScroller', () => {
	it('reserves heights and windows once on attach', () => {
		const { scroller, grid, onWindowChanged } = build(scrollEl(500, 400));
		scroller.attach();
		expect(grid.reserveHeight).toHaveBeenCalledTimes(1);
		expect(grid.update).toHaveBeenCalledTimes(1);
		expect(onWindowChanged).toHaveBeenCalledTimes(1);
	});

	it('does not notify when no window changed', () => {
		const { scroller, onWindowChanged } = build(scrollEl(500, 400), undefined, false);
		scroller.attach();
		expect(onWindowChanged).not.toHaveBeenCalled();
	});

	it('skips windowing when the scroller has no size', () => {
		const { scroller, grid } = build(scrollEl(0, 400));
		scroller.attach();
		expect(grid.update).not.toHaveBeenCalled();
		const b = build(scrollEl(500, 0));
		b.scroller.attach();
		expect(b.grid.update).not.toHaveBeenCalled();
	});

	it('skips windowing without sections', () => {
		const metrics = vi.fn(() => metricsOf(100));
		const scroller = new VirtualScroller({ scroll: scrollEl(500, 400), metrics });
		scroller.attach();
		expect(metrics).toHaveBeenCalledTimes(1);
	});

	it('restores the scroll position', () => {
		const scroll = scrollEl(500, 400);
		const { scroller, grid } = build(scroll);
		scroller.attach(250);
		expect(scroll.scrollTop).toBe(250);
		expect(grid.update).toHaveBeenCalledWith(expect.any(Number), 400, expect.anything());
	});

	it('reports the scroll position and re-windows past half a row', () => {
		const scroll = scrollEl(500, 400);
		const { scroller, grid, onScrollPos } = build(scroll);
		scroller.attach();
		scroll.scrollTop = 10;
		scroll.dispatchEvent(new Event('scroll'));
		expect(onScrollPos).toHaveBeenLastCalledWith(10);
		expect(grid.update).toHaveBeenCalledTimes(1);
		scroll.scrollTop = 80;
		scroll.dispatchEvent(new Event('scroll'));
		expect(grid.update).toHaveBeenCalledTimes(2);
	});

	it('uses a fixed threshold when the row height is unknown', () => {
		const scroll = scrollEl(500, 400);
		const { scroller, grid } = build(scroll, vi.fn(() => metricsOf(0)));
		scroller.attach();
		scroll.scrollTop = 40;
		scroll.dispatchEvent(new Event('scroll'));
		expect(grid.update).toHaveBeenCalledTimes(1);
		scroll.scrollTop = 60;
		scroll.dispatchEvent(new Event('scroll'));
		expect(grid.update).toHaveBeenCalledTimes(2);
	});

	it('coalesces scrolls into one pending frame', () => {
		const frames: Array<() => void> = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(() => cb(0)); return 1; });
		const scroll = scrollEl(500, 400);
		const { scroller, grid } = build(scroll);
		scroller.attach();
		scroll.scrollTop = 100;
		scroll.dispatchEvent(new Event('scroll'));
		scroll.scrollTop = 200;
		scroll.dispatchEvent(new Event('scroll'));
		expect(frames).toHaveLength(1);
		frames[0]!();
		expect(grid.update).toHaveBeenCalledTimes(2);
	});

	it('remeasures on resize', () => {
		const { scroller, grid } = build(scrollEl(500, 400));
		scroller.attach();
		resizeCb();
		expect(grid.reserveHeight).toHaveBeenCalledTimes(2);
	});

	it('remeasures when the row height changed', () => {
		let rowHeight = 100;
		const scroll = scrollEl(500, 400);
		const { scroller, grid } = build(scroll, vi.fn(() => metricsOf(rowHeight)));
		scroller.attach();
		rowHeight = 120;
		scroll.scrollTop = 500;
		scroll.dispatchEvent(new Event('scroll'));
		expect(grid.reserveHeight).toHaveBeenCalledTimes(2);
	});

	it('tears down listeners, observer and pending frame', () => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 7);
		const scroll = scrollEl(500, 400);
		const { scroller, grid } = build(scroll);
		scroller.attach();
		scroll.scrollTop = 100;
		scroll.dispatchEvent(new Event('scroll'));
		scroller.destroy();
		expect(window.cancelAnimationFrame).toHaveBeenCalledWith(7);
		expect(disconnect).toHaveBeenCalled();
		scroll.scrollTop = 900;
		scroll.dispatchEvent(new Event('scroll'));
		expect(grid.update).toHaveBeenCalledTimes(1);
		scroller.destroy();
	});
});
