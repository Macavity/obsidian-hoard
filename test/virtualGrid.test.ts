import { describe, it, expect, vi } from "vitest";
import { VirtualGrid, setRowsCardWidth, computeGridMetrics } from "../src/design-system/VirtualGrid";

(globalThis as { createFragment?: () => DocumentFragment }).createFragment ??= () => document.createDocumentFragment();

const prop = (el: HTMLElement, name: string): string => el.style.getPropertyValue(name);

function mount(count: number, options?: ConstructorParameters<typeof VirtualGrid>[4]) {
	const spacer = createDiv();
	const grid = spacer.createDiv();
	const cb = {
		buildItem: () => createDiv({ cls: "card" }),
		removeItem: (el: HTMLElement) => el.remove(),
	};
	return { spacer, grid, vgrid: new VirtualGrid(spacer, grid, count, cb, options) };
}

describe("VirtualGrid custom properties", () => {
	const metrics = { cols: 2, cardWidth: 100, cardHeight: 150, rowHeight: 162 };

	it("reserves the spacer height through a variable", () => {
		const { spacer, vgrid } = mount(10);
		vgrid.reserveHeight(metrics);
		expect(prop(spacer, "--hoard-card-grid-spacer-height")).toBe(`${5 * 162}px`);
	});

	it("publishes offset, columns and card height on the grid", () => {
		const { spacer, grid, vgrid } = mount(40);
		vgrid.update(0, 300, metrics);
		expect(prop(spacer, "--hoard-card-grid-spacer-height")).toBe(`${20 * 162}px`);
		expect(prop(grid, "--hoard-card-grid-offset")).toBe("0px");
		expect(prop(grid, "--hoard-card-grid-columns")).toBe("2");
		expect(prop(grid, "--hoard-card-height")).toBe("150px");
		vgrid.update(162 * 10, 300, metrics);
		expect(prop(grid, "--hoard-card-grid-offset")).toBe(`${8 * 162}px`);
	});

	it("uses the variable names passed in the options", () => {
		const { grid, vgrid } = mount(4, { colsVar: "--c", cardHeightVar: "--h", offsetVar: "--o" });
		vgrid.update(0, 300, metrics);
		expect([prop(grid, "--c"), prop(grid, "--h"), prop(grid, "--o")]).toEqual(["2", "150px", "0px"]);
	});

	it("does not write while window and geometry are unchanged", () => {
		const { grid, vgrid } = mount(40);
		vgrid.update(0, 300, metrics);
		const spy = vi.spyOn(grid, "setCssProps");
		expect(vgrid.update(10, 300, metrics)).toBe(false);
		expect(spy).not.toHaveBeenCalled();
	});

	it("computes metrics for the helper", () => {
		expect(computeGridMetrics(400).cols).toBe(2);
	});
});

describe("setRowsCardWidth", () => {
	it("writes once per distinct width without reading the style back", () => {
		const scroll = createDiv();
		const set = vi.spyOn(scroll, "setCssProps");
		setRowsCardWidth(scroll, 120.4);
		setRowsCardWidth(scroll, 120.2);
		setRowsCardWidth(scroll, 130);
		setRowsCardWidth(scroll, 0);
		expect(set).toHaveBeenCalledTimes(2);
		expect(prop(scroll, "--hoard-rows-view-card-width")).toBe("130px");
	});
});

describe("VirtualGrid window transitions", () => {
	const metrics = { cols: 4, cardWidth: 100, cardHeight: 88, rowHeight: 100 };
	const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

	function mountIndexed(count: number) {
		const spacer = createDiv();
		const grid = spacer.createDiv();
		const built: number[] = [];
		const removed: number[] = [];
		const cb = {
			buildItem: (i: number) => {
				built.push(i);
				return createDiv({ cls: "card", attr: { "data-i": String(i) } });
			},
			removeItem: (el: HTMLElement) => {
				removed.push(Number(el.dataset.i));
				el.remove();
			},
		};
		const indices = () => Array.from(grid.children).map((c) => Number((c as HTMLElement).dataset.i));
		return { built, removed, indices, vgrid: new VirtualGrid(spacer, grid, count, cb) };
	}

	it("renders the initial window", () => {
		const { vgrid, indices } = mountIndexed(40);
		expect(vgrid.update(0, 300, metrics)).toBe(true);
		expect(indices()).toEqual(range(0, 23));
	});

	it("scrolling down trims the top and appends the new rows", () => {
		const { vgrid, built, removed, indices } = mountIndexed(40);
		vgrid.update(0, 300, metrics);
		built.length = 0;
		expect(vgrid.update(200, 300, metrics)).toBe(true);
		expect(indices()).toEqual(range(0, 31));
		expect(removed).toEqual([]);
		expect(built).toEqual(range(24, 31));
		vgrid.update(400, 300, metrics);
		expect(indices()).toEqual(range(8, 39));
		expect(removed).toEqual(range(0, 7));
	});

	it("scrolling up trims the bottom and prepends the new rows", () => {
		const { vgrid, built, removed, indices } = mountIndexed(40);
		vgrid.update(1000, 300, metrics);
		expect(indices()).toEqual(range(32, 39));
		built.length = 0;
		expect(vgrid.update(700, 300, metrics)).toBe(true);
		expect(indices()).toEqual(range(20, 39));
		expect(built).toEqual(range(20, 31));
		vgrid.update(0, 300, metrics);
		expect(indices()).toEqual(range(0, 23));
		expect(removed.slice().sort((a, b) => a - b)).toEqual(range(24, 39));
	});

	it("replaces the window when old and new do not overlap", () => {
		const { vgrid, removed, indices } = mountIndexed(100);
		vgrid.update(0, 300, metrics);
		vgrid.update(2000, 300, metrics);
		expect(indices()[0]).toBeGreaterThan(23);
		expect(removed).toEqual(range(0, 23));
	});

	it("empties the grid when it scrolls out of the viewport", () => {
		const { vgrid, indices } = mountIndexed(40);
		vgrid.update(0, 300, metrics);
		expect(vgrid.update(-5000, 300, metrics)).toBe(true);
		expect(indices()).toEqual([]);
	});
});
