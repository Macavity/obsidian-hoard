import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleFilterPanel, type FilterPanelConfig } from '../../src/design-system/FilterPanel';

let teardowns: Array<() => void> = [];

function setup(over: Partial<FilterPanelConfig> = {}) {
	const anchor = document.body.createDiv();
	const exclA = new Set<string>(['b']);
	const exclB = new Set<string>();
	const fav = { v: true };
	const wish = { v: true };
	const recent = { v: false };
	const indep = { v: false };
	const cfg: FilterPanelConfig = {
		anchor,
		outsideGuard: anchor,
		sections: [
			{
				label: 'A', opts: ['a', 'b'], excludeSet: exclA, formatOpt: (o) => o.toUpperCase(),
				specials: [
					{ text: 'Recent', spanCls: 'rec', mode: 'exclusive', resetOnGlobal: true, get: () => recent.v, set: (v) => { recent.v = v; }, dividerAfter: true },
					{ text: 'Indep', mode: 'independent', get: () => indep.v, set: (v) => { indep.v = v; } },
				],
			},
			{ label: 'B', opts: ['x'], excludeSet: exclB },
			{ label: 'Empty', opts: [], excludeSet: new Set() },
		],
		favorites: { get: () => fav.v, set: (v) => { fav.v = v; } },
		standaloneRows: [
			{ text: 'Wish', spanCls: 'wish', get: () => wish.v, set: (v) => { wish.v = v; } },
			{ text: 'Plain', get: () => false, set: () => undefined },
		],
		presetExists: false,
		onPresetSave: vi.fn(),
		onPresetDelete: vi.fn(),
		onPresetChanged: vi.fn(),
		onApply: vi.fn(),
		registerCleanup: (fn) => { teardowns.push(fn); },
		...over,
	};
	toggleFilterPanel(cfg);
	const panel = document.querySelector('.hoard-filter-panel') as HTMLElement;
	return { cfg, panel, exclA, exclB, fav, wish, recent, indep };
}

const click = (el: Element | null | undefined): void => { (el as HTMLElement).click(); };
const btn = (panel: HTMLElement, text: string): HTMLElement =>
	Array.from(panel.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLElement;
const boxes = (panel: HTMLElement): HTMLInputElement[] =>
	Array.from(panel.querySelectorAll('input[type=checkbox]'));

beforeEach(() => {
	vi.useFakeTimers();
	teardowns = [];
	vi.stubGlobal('activeDocument', document);
});

afterEach(() => {
	teardowns.forEach((f) => f());
	document.querySelectorAll('.hoard-filter-panel').forEach((e) => e.remove());
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('toggleFilterPanel', () => {
	it('opens and a second call closes it', () => {
		const { cfg } = setup();
		expect(document.querySelectorAll('.hoard-filter-panel')).toHaveLength(1);
		toggleFilterPanel(cfg);
		expect(document.querySelectorAll('.hoard-filter-panel')).toHaveLength(0);
	});

	it('expands and collapses sections', () => {
		const { panel } = setup();
		const header = panel.querySelector('.hoard-filter-panel__section-header')!;
		const content = panel.querySelector('.hoard-filter-panel__section-content')!;
		const chevron = header.querySelector('.hoard-filter-panel__chevron')!;
		expect(content.classList.contains('hoard-hidden')).toBe(true);
		click(header);
		expect(content.classList.contains('hoard-hidden')).toBe(false);
		expect(chevron.textContent).toBe('▲');
		click(header);
		expect(chevron.textContent).toBe('▼');
	});

	it('formats option labels and reflects excludes', () => {
		const { panel } = setup();
		const rows = panel.querySelectorAll('.hoard-filter-panel__section-content')[0]!;
		expect(rows.textContent).toContain('A');
		expect(rows.textContent).toContain('B');
		const cbs = Array.from(rows.querySelectorAll('input'));
		// all, recent, indep, a, b
		expect(cbs.map((c) => c.checked)).toEqual([false, false, false, true, false]);
	});

	it('option changes update the exclude set and clear exclusive specials', () => {
		const { panel, exclA, recent } = setup();
		const cbs = boxes(panel);
		const content = panel.querySelectorAll('.hoard-filter-panel__section-content')[0]!;
		const [, rec, , optA, optB] = Array.from(content.querySelectorAll('input'));
		rec!.checked = true;
		rec!.dispatchEvent(new Event('change'));
		expect(recent.v).toBe(true);
		expect(exclA.size).toBe(0);
		expect(optB!.checked).toBe(true);
		optA!.checked = false;
		optA!.dispatchEvent(new Event('change'));
		expect(exclA.has('a')).toBe(true);
		expect(recent.v).toBe(false);
		expect(rec!.checked).toBe(false);
		optA!.checked = true;
		optA!.dispatchEvent(new Event('change'));
		expect(exclA.has('a')).toBe(false);
		expect(cbs.length).toBeGreaterThan(0);
	});

	it('independent specials just set their value and unchecking exclusive keeps excludes', () => {
		const { panel, indep, exclA, recent } = setup();
		const content = panel.querySelectorAll('.hoard-filter-panel__section-content')[0]!;
		const [, rec, ind] = Array.from(content.querySelectorAll('input'));
		ind!.checked = true;
		ind!.dispatchEvent(new Event('change'));
		expect(indep.v).toBe(true);
		expect(exclA.has('b')).toBe(true);
		rec!.checked = false;
		rec!.dispatchEvent(new Event('change'));
		expect(recent.v).toBe(false);
		expect(exclA.has('b')).toBe(true);
	});

	it('the All row toggles every option of its section, via checkbox and row clicks', () => {
		const { panel, exclA, exclB } = setup();
		const contents = panel.querySelectorAll('.hoard-filter-panel__section-content');
		const allRowA = contents[0]!.querySelector('.hoard-filter-panel__checkbox-row')!;
		const allCbA = allRowA.querySelector('input') as HTMLInputElement;
		click(allRowA);
		expect(exclA.size).toBe(0);
		expect(allCbA.checked).toBe(true);
		click(allCbA);
		expect(Array.from(exclA).sort()).toEqual(['a', 'b']);
		expect(allCbA.checked).toBe(false);
		// section B starts all-checked: first toggle unchecks
		const allCbB = contents[1]!.querySelector('input') as HTMLInputElement;
		expect(allCbB.checked).toBe(true);
		click(allCbB);
		expect(exclB.has('x')).toBe(true);
		// a section without options is never "all checked"
		const allCbEmpty = contents[2]!.querySelector('input') as HTMLInputElement;
		expect(allCbEmpty.checked).toBe(false);
		click(allCbEmpty);
		expect(allCbEmpty.checked).toBe(false);
	});

	it('Select all and Deselect all drive every section and reset the global rows', () => {
		const { panel, exclA, exclB, fav, wish, recent } = setup();
		recent.v = true;
		click(btn(panel, 'Select all') ?? panel.querySelectorAll('.hoard-filter-panel__global-btns button')[0]);
		expect(exclA.size).toBe(0);
		expect(fav.v).toBe(false);
		expect(wish.v).toBe(false);
		expect(recent.v).toBe(false);
		click(panel.querySelectorAll('.hoard-filter-panel__global-btns button')[1]);
		expect(Array.from(exclA).sort()).toEqual(['a', 'b']);
		expect(Array.from(exclB)).toEqual(['x']);
	});

	it('favorites and standalone rows write their values', () => {
		const { panel, fav, wish } = setup();
		const [favCb, wishCb] = boxes(panel).slice(0, 2);
		expect(favCb!.checked).toBe(true);
		favCb!.checked = false;
		favCb!.dispatchEvent(new Event('change'));
		expect(fav.v).toBe(false);
		wishCb!.checked = false;
		wishCb!.dispatchEvent(new Event('change'));
		expect(wish.v).toBe(false);
	});

	it('omits optional rows when not configured', () => {
		const { panel } = setup({ favorites: undefined, standaloneRows: undefined, registerCleanup: undefined, sections: [] });
		expect(panel.querySelector('.hoard-filter-panel__checkbox-row--favorites')).toBeNull();
	});

	it('Save runs the save callback, closes and reports', async () => {
		const { cfg, panel } = setup();
		const saveBtn = panel.querySelectorAll('.hoard-filter-panel__global-btns button')[2]!;
		click(saveBtn);
		await vi.waitFor(() => expect(cfg.onPresetChanged).toHaveBeenCalled());
		expect(cfg.onPresetSave).toHaveBeenCalled();
		expect(cfg.onPresetDelete).not.toHaveBeenCalled();
		expect(document.querySelector('.hoard-filter-panel')).toBeNull();
	});

	it('runs the delete callback when a preset exists', async () => {
		const { cfg, panel } = setup({ presetExists: true });
		click(panel.querySelectorAll('.hoard-filter-panel__global-btns button')[2]);
		await vi.waitFor(() => expect(cfg.onPresetChanged).toHaveBeenCalled());
		expect(cfg.onPresetDelete).toHaveBeenCalled();
	});

	it('Apply commits and closes', () => {
		const { cfg, panel } = setup();
		click(panel.querySelector('.hoard-filter-panel__apply-btn'));
		expect(cfg.onApply).toHaveBeenCalled();
		expect(document.querySelector('.hoard-filter-panel')).toBeNull();
	});

	it('closes on an outside mousedown but not inside or on the guard', () => {
		const { panel, cfg } = setup();
		vi.runAllTimers();
		panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(document.querySelector('.hoard-filter-panel')).not.toBeNull();
		cfg.outsideGuard.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(document.querySelector('.hoard-filter-panel')).not.toBeNull();
		document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(document.querySelector('.hoard-filter-panel')).toBeNull();
	});

	it('does not attach the outside listener when closed before the timer fires', () => {
		const { panel } = setup();
		click(panel.querySelector('.hoard-filter-panel__apply-btn'));
		vi.runAllTimers();
		document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(document.querySelector('.hoard-filter-panel')).toBeNull();
	});

	it('the registered teardown is idempotent', () => {
		setup();
		teardowns[0]!();
		teardowns[0]!();
		expect(document.querySelector('.hoard-filter-panel')).toBeNull();
	});
});
