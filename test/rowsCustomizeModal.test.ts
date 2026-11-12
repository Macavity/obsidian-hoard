import { describe, expect, it, vi } from 'vitest';
import { RowsCustomizeModal, type RowsCustomizeConfig } from '../src/RowsCustomizeModal';
import type { RowsShelfLayoutEntry } from '../src/types';

const shelves = [
	{ id: 'a', label: 'Alpha' },
	{ id: 'byType', label: 'By type' },
	{ id: 'byStatus', label: 'By status' },
];

function open(stored: RowsShelfLayoutEntry[]) {
	let layout: RowsShelfLayoutEntry[] = stored;
	const config: RowsCustomizeConfig = {
		shelves,
		getLayout: () => layout,
		setLayout: (l) => { layout = l; },
		onChanged: vi.fn(),
		exclusiveGroups: [['byType', 'byStatus']],
		persist: vi.fn(),
	};
	const modal = new RowsCustomizeModal({} as never, { settings: {} } as never, config);
	modal.open();
	const rows = (): HTMLElement[] => Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.hoard-rows-customize__row'));
	const names = (): string[] => rows().map((r) => r.querySelector('.hoard-rows-customize__name')!.textContent ?? '');
	const toggle = (i: number): void => {
		const controls = rows()[i]!.querySelector('.hoard-rows-customize__controls')!;
		(controls.lastElementChild as HTMLElement).click();
	};
	return { modal, config, rows, names, toggle, layout: () => layout };
}

const stored = (): RowsShelfLayoutEntry[] => [
	{ id: 'a', enabled: true },
	{ id: 'byType', enabled: true },
	{ id: 'byStatus', enabled: false },
];

describe('RowsCustomizeModal', () => {
	it('builds framed move buttons, disabled at the ends', () => {
		const { rows } = open(stored());
		const [up, down] = Array.from(rows()[0]!.querySelectorAll<HTMLButtonElement>('button.hoard-rows-customize__move'));
		expect(up!.classList.contains('hoard-icon-btn--framed')).toBe(true);
		expect(up!.getAttribute('data-icon')).toBe('chevron-up');
		expect(down!.getAttribute('data-icon')).toBe('chevron-down');
		expect(up!.disabled).toBe(true);
		expect(rows().at(-1)!.querySelectorAll<HTMLButtonElement>('button')[1]!.disabled).toBe(true);
	});

	it('moves a shelf down and up and persists each move', () => {
		const { rows, names, config } = open(stored());
		rows()[0]!.querySelectorAll<HTMLButtonElement>('button')[1]!.click();
		expect(names()).toEqual(['By type', 'Alpha', 'By status']);
		rows()[1]!.querySelectorAll<HTMLButtonElement>('button')[0]!.click();
		expect(names()).toEqual(['Alpha', 'By type', 'By status']);
		expect(config.persist).toHaveBeenCalledTimes(2);
		expect(config.onChanged).toHaveBeenCalledTimes(2);
	});

	it('turns the other member of an exclusive group off when one is enabled', () => {
		const { toggle, layout, config } = open(stored());
		toggle(2);
		expect(layout().find((e) => e.id === 'byStatus')!.enabled).toBe(true);
		expect(layout().find((e) => e.id === 'byType')!.enabled).toBe(false);
		expect(config.persist).toHaveBeenCalledTimes(1);
	});

	it('persists a plain toggle without touching other shelves', () => {
		const { toggle, layout, config } = open(stored());
		toggle(0);
		expect(layout().find((e) => e.id === 'a')!.enabled).toBe(false);
		expect(layout().find((e) => e.id === 'byType')!.enabled).toBe(true);
		toggle(1);
		toggle(1);
		expect(layout().find((e) => e.id === 'byType')!.enabled).toBe(true);
		expect(config.persist).toHaveBeenCalledTimes(3);
	});
});
