import { describe, expect, it } from 'vitest';
import { customCellView } from '../src/modules/custom-lists/domain/cellView';
import type { CustomListColumn } from '../src/shared/domain/columns';

const select: CustomListColumn = { id: 's', label: 'S', type: 'select', options: ['A'], optionColors: { A: '#f00' } };
const text: CustomListColumn = { id: 't', label: 'T', type: 'text' };

describe('customCellView', () => {
	it('shows a coloured badge for a select value', () => {
		expect(customCellView('A', select)).toEqual({ kind: 'badge', text: 'A', color: '#f00' });
	});
	it('omits the colour when none is assigned', () => {
		expect(customCellView('B', select)).toEqual({ kind: 'badge', text: 'B', color: undefined });
	});
	it('is empty for a blank or missing select value', () => {
		expect(customCellView('', select)).toEqual({ kind: 'empty' });
		expect(customCellView(undefined, select)).toEqual({ kind: 'empty' });
	});
	it('keeps a zero in a text cell', () => {
		expect(customCellView(0, text)).toEqual({ kind: 'text', text: '0', bold: false, italic: false });
	});
	it('is empty for a blank text value', () => {
		expect(customCellView('', text)).toEqual({ kind: 'empty' });
		expect(customCellView(undefined, text)).toEqual({ kind: 'empty' });
	});
	it('carries bold and italic', () => {
		expect(customCellView('x', { ...text, bold: true })).toEqual({ kind: 'text', text: 'x', bold: true, italic: false });
		expect(customCellView('x', { ...text, italic: true })).toEqual({ kind: 'text', text: 'x', bold: false, italic: true });
	});
});
