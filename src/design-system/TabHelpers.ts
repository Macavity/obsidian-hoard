import { VirtualGrid, type VirtualGridCallbacks } from './VirtualGrid';

/** Creates the spacer + virtual card grid inside `section` and wires up a VirtualGrid for `count` items. */
export function mountVirtualCardGrid(
	section: HTMLElement,
	count: number,
	callbacks: VirtualGridCallbacks,
): { spacer: HTMLElement; vgrid: VirtualGrid } {
	const spacer = section.createDiv({ cls: 'hoard-rows-view__grouped-spacer' });
	const grid = spacer.createDiv({ cls: 'hoard-card-grid hoard-card-grid--virtual' });
	return { spacer, vgrid: new VirtualGrid(spacer, grid, count, callbacks) };
}
