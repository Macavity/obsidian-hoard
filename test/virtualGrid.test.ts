import { describe, it, expect, vi } from "vitest";
import { VirtualGrid, setRowsCardWidth, computeGridMetrics } from "../src/VirtualGrid";

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
