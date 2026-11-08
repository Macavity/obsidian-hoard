import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleSortPopover, type SortPopoverConfig } from '../../src/SortPopover';

(globalThis as { activeDocument?: Document }).activeDocument = document;

const labelToKey = (label: string): string => label.toLowerCase();

function setup(over: Partial<SortPopoverConfig> = {}) {
	const wrap = document.createElement('div');
	const anchor = wrap.createEl('button');
	document.body.appendChild(wrap);
	const onChange = vi.fn();
	const cfg: SortPopoverConfig = {
		wrap, anchor, options: ['Title', 'Rating'], labelToKey,
		defaultDirs: { title: 'asc', rating: 'desc' },
		primary: { key: 'title', dir: 'asc' },
		secondary: { key: 'none', dir: 'asc' },
		onChange,
		...over,
	};
	return { cfg, wrap, anchor, onChange };
}

const rows = (wrap: HTMLElement): HTMLElement[] => Array.from(wrap.querySelectorAll<HTMLElement>('.hoard-filter-row'));

afterEach(() => {
	document.body.replaceChildren();
	Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
});

describe('sort popover', () => {
	it('renders a sort-by and a then-by row with the current selection and direction', () => {
		const { cfg, wrap } = setup({ secondary: { key: 'rating', dir: 'desc' } });
		toggleSortPopover(cfg);
		const [primary, secondary] = rows(wrap) as [HTMLElement, HTMLElement];
		expect((primary.querySelector('select') as HTMLSelectElement).value).toBe('Title');
		expect(primary.querySelector('option[value=none]')).toBeNull();
		expect(primary.querySelector('.hoard-sort-dir-btn')!.textContent).toBe('↑');
		expect((secondary.querySelector('select') as HTMLSelectElement).value).toBe('Rating');
		expect(secondary.querySelector('option[value=none]')).not.toBeNull();
		expect(secondary.querySelector('.hoard-sort-dir-btn')!.textContent).toBe('↓');
	});

	it('preselects None for an unset secondary sort', () => {
		const { cfg, wrap } = setup();
		toggleSortPopover(cfg);
		expect((rows(wrap)[1]!.querySelector('select') as HTMLSelectElement).value).toBe('none');
	});

	it('toggles: a second call closes the open panel', () => {
		const { cfg, wrap } = setup();
		toggleSortPopover(cfg);
		expect(wrap.querySelector('.hoard-dropdown')).not.toBeNull();
		toggleSortPopover(cfg);
		expect(wrap.querySelector('.hoard-dropdown')).toBeNull();
	});

	it('uses the mobile layout below 600px', () => {
		Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
		const { cfg, wrap } = setup();
		vi.spyOn(cfg.anchor, 'getBoundingClientRect').mockReturnValue(
			{ top: 0, bottom: 40, left: 0, right: 10, width: 10, height: 40, x: 0, y: 0, toJSON: () => ({}) },
		);
		toggleSortPopover(cfg);
		const panel = wrap.querySelector<HTMLElement>('.hoard-sorting-panel')!;
		expect(panel.classList.contains('hoard-sorting-panel-mobile')).toBe(true);
		expect(panel.style.top).toBe('44px');
	});

	it('changing the primary key applies that key default direction and closes', () => {
		const { cfg, wrap, onChange } = setup();
		toggleSortPopover(cfg);
		const sel = rows(wrap)[0]!.querySelector('select') as HTMLSelectElement;
		sel.value = 'Rating';
		sel.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith({ key: 'rating', dir: 'desc' }, { key: 'none', dir: 'asc' });
		expect(wrap.querySelector('.hoard-dropdown')).toBeNull();
	});

	it('choosing None on the secondary row reports the none key', () => {
		const { cfg, wrap, onChange } = setup({ secondary: { key: 'rating', dir: 'desc' } });
		toggleSortPopover(cfg);
		const sel = rows(wrap)[1]!.querySelector('select') as HTMLSelectElement;
		sel.value = 'none';
		sel.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith({ key: 'title', dir: 'asc' }, { key: 'none', dir: 'asc' });
	});

	it('falls back to ascending for keys without a default direction', () => {
		const { cfg, wrap, onChange } = setup({ defaultDirs: {} });
		toggleSortPopover(cfg);
		const sel = rows(wrap)[1]!.querySelector('select') as HTMLSelectElement;
		sel.value = 'Rating';
		sel.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith({ key: 'title', dir: 'asc' }, { key: 'rating', dir: 'asc' });
	});

	it('flips the direction of either row and closes', () => {
		const { cfg, wrap, onChange } = setup();
		toggleSortPopover(cfg);
		(rows(wrap)[0]!.querySelector('.hoard-sort-dir-btn') as HTMLElement).click();
		expect(onChange).toHaveBeenLastCalledWith({ key: 'title', dir: 'desc' }, { key: 'none', dir: 'asc' });
		toggleSortPopover(cfg);
		(rows(wrap)[1]!.querySelector('.hoard-sort-dir-btn') as HTMLElement).click();
		expect(onChange).toHaveBeenLastCalledWith({ key: 'title', dir: 'asc' }, { key: 'none', dir: 'desc' });
		expect(wrap.querySelector('.hoard-dropdown')).toBeNull();
	});

	it('closes on an outside click but not on one inside the wrap', async () => {
		const { cfg, wrap } = setup();
		toggleSortPopover(cfg);
		await new Promise((r) => setTimeout(r, 5));
		wrap.click();
		expect(wrap.querySelector('.hoard-dropdown')).not.toBeNull();
		document.body.click();
		expect(wrap.querySelector('.hoard-dropdown')).toBeNull();
	});

	it('hands out a teardown that closes the panel and survives running before the listener attaches', async () => {
		let teardown: (() => void) | null = null;
		const { cfg, wrap } = setup({ registerCleanup: (fn) => { teardown = fn; } });
		const add = vi.spyOn(document, 'addEventListener');
		toggleSortPopover(cfg);
		teardown!();
		teardown!();
		expect(wrap.querySelector('.hoard-dropdown')).toBeNull();
		await new Promise((r) => setTimeout(r, 5));
		expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(0);
		add.mockRestore();
	});
});
