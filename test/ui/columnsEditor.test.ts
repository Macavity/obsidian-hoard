import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { cloneColumns, moveColumn, normalizeColumns, renderColumnsEditor, validateColumns } from '../../src/ui/ColumnsEditor';
import type { CustomListColumn, CustomListRow } from '../../src/types';

const col = (over: Partial<CustomListColumn> = {}): CustomListColumn => ({
	id: 'c1', label: 'A', type: 'text', bold: false, italic: false, ...over,
});

describe('cloneColumns', () => {
	it('copies options and colours so the source stays untouched', () => {
		const src = [col({ type: 'select', options: ['x'], optionColors: { x: '#fff' } })];
		const copy = cloneColumns(src);
		copy[0]!.options!.push('y');
		copy[0]!.optionColors!['y'] = '#000';
		expect(src[0]!.options).toEqual(['x']);
		expect(src[0]!.optionColors).toEqual({ x: '#fff' });
	});
});

describe('moveColumn', () => {
	const ids = (cols: CustomListColumn[]): string => cols.map(c => c.id).join('');
	const mk = (): CustomListColumn[] => ['a', 'b', 'c'].map(id => col({ id }));
	it('moves forward to a drop slot', () => {
		const cols = mk();
		moveColumn(cols, 0, 2);
		expect(ids(cols)).toBe('bac');
	});
	it('moves backward', () => {
		const cols = mk();
		moveColumn(cols, 2, 0);
		expect(ids(cols)).toBe('cab');
	});
});

describe('validateColumns', () => {
	it('accepts valid columns', () => {
		expect(validateColumns([col(), col({ type: 'select', options: ['x'] })])).toBeNull();
	});
	it('rejects blank labels', () => {
		expect(validateColumns([col({ label: '  ' })])).toEqual({ reason: 'emptyName' });
	});
	it('rejects select without options', () => {
		expect(validateColumns([col({ type: 'select', options: [] })]))
			.toEqual({ reason: 'noOptions', label: 'A' });
	});
});

describe('normalizeColumns', () => {
	it('trims labels and options and drops stale colours', () => {
		const cols = [col({ label: ' A ', type: 'select', options: [' x ', ' '], optionColors: { x: '#fff', gone: '#000' } })];
		normalizeColumns(cols);
		expect(cols[0]!.label).toBe('A');
		expect(cols[0]!.options).toEqual(['x']);
		expect(cols[0]!.optionColors).toEqual({ x: '#fff' });
	});
	it('removes colours from non-select columns', () => {
		const cols = [col({ optionColors: { x: '#fff' } })];
		normalizeColumns(cols);
		expect(cols[0]!.optionColors).toBeUndefined();
	});
});

describe('renderColumnsEditor format toggles', () => {
	const render = (cols: CustomListColumn[]): HTMLElement => {
		const host = document.createElement('div');
		renderColumnsEditor(host, { cols }, {
			app: {} as App,
			rows: [],
			renderHeader: () => {},
			newColumnId: () => 'col_x',
			onSave: () => {},
			onCancel: () => {},
		});
		return host;
	};

	it('exposes bold, italic and auto-time as pressed toggles with a tooltip, not a title', () => {
		const host = render([col({ id: 'col_1', type: 'number', bold: true })]);
		const bold = host.querySelector<HTMLElement>('.hoard-edit-columns__bold-btn')!;
		const italic = host.querySelector<HTMLElement>('.hoard-edit-columns__italic-btn')!;
		const auto = host.querySelector<HTMLElement>('.hoard-edit-columns__autotime-btn')!;
		expect(bold.getAttribute('aria-pressed')).toBe('true');
		expect(italic.getAttribute('aria-pressed')).toBe('false');
		expect(auto.getAttribute('aria-pressed')).toBe('false');
		expect(auto.hasAttribute('title')).toBe(false);
		expect(auto.getAttribute('data-tooltip')).toBe(auto.getAttribute('aria-label'));
		auto.click();
		italic.click();
		bold.click();
		expect(auto.getAttribute('aria-pressed')).toBe('true');
		expect(italic.getAttribute('aria-pressed')).toBe('true');
		expect(bold.getAttribute('aria-pressed')).toBe('false');
	});
});

describe('renderColumnsEditor select columns', () => {
	const render = (cols: CustomListColumn[], rows: CustomListRow[] = []): HTMLElement => {
		const host = document.createElement('div');
		document.body.appendChild(host);
		renderColumnsEditor(host, { cols }, {
			app: {} as App,
			rows,
			renderHeader: () => {},
			newColumnId: () => 'col_x',
			onSave: () => {},
			onCancel: () => {},
		});
		return host;
	};

	it('derives the options from distinct cell values when a column turns into a select', () => {
		const column = col({ id: 'col_1', options: ['stale'] });
		const rows = [
			{ id: 'r1', name: 'a', col_1: ' High ' },
			{ id: 'r2', name: 'b', col_1: 'Low' },
			{ id: 'r3', name: 'c', col_1: 'High' },
			{ id: 'r4', name: 'd', col_1: '' },
			{ id: 'r5', name: 'e', col_1: 3 },
			{ id: 'r6', name: 'f' },
		] as CustomListRow[];
		const host = render([column], rows);
		const select = host.querySelector<HTMLSelectElement>('select')!;
		select.value = 'select';
		select.dispatchEvent(new Event('change'));
		expect(column.type).toBe('select');
		expect(column.options).toEqual(['High', 'Low', '3']);
		// re-rendered with an option row per derived value
		expect(host.querySelectorAll('.hoard-edit-columns__card-option-row')).toHaveLength(3);
	});

	it('keeps the stored options when switching to another type', () => {
		const column = col({ id: 'col_1', options: ['keep'] });
		const host = render([column]);
		const select = host.querySelector<HTMLSelectElement>('select')!;
		select.value = 'number';
		select.dispatchEvent(new Event('change'));
		expect(column.type).toBe('number');
		expect(column.options).toEqual(['keep']);
	});

	it('colours a named option through the picker and clears it again', () => {
		const column = col({ id: 'col_1', type: 'select', options: ['', 'Done'] });
		const host = render([column]);
		const [blankDot, doneDot] = Array.from(host.querySelectorAll<HTMLElement>('.hoard-edit-columns__option-color-dot'));
		blankDot!.click();
		expect(host.querySelector('.hoard-color-picker__palette')).toBeNull();

		doneDot!.click();
		host.querySelector<HTMLElement>('.hoard-color-picker__palette-swatch:not(.hoard-color-picker__palette-swatch--custom):not(.hoard-color-picker__palette-swatch--clear)')!.click();
		expect(column.optionColors?.['Done']).toMatch(/^#/);
		expect(doneDot!.classList.contains('is-unset')).toBe(false);

		doneDot!.click();
		host.querySelector<HTMLElement>('.hoard-color-picker__palette-swatch--clear')!.click();
		expect(column.optionColors?.['Done']).toBeUndefined();
		expect(doneDot!.classList.contains('is-unset')).toBe(true);
	});
});
