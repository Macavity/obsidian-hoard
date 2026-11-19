import type { CustomListColumn, CustomListRow } from '../../../shared/domain/columns';

export type CellView =
	| { kind: 'empty' }
	| { kind: 'badge'; text: string; color?: string }
	| { kind: 'text'; text: string; bold: boolean; italic: boolean };

/** What a custom-list cell shows for a value: nothing, a (coloured) select badge, or text. */
export function customCellView(value: CustomListRow[string], col: CustomListColumn): CellView {
	if (col.type === 'select') {
		const text = String(value ?? '');
		if (!text) return { kind: 'empty' };
		return { kind: 'badge', text, color: col.optionColors?.[text] };
	}
	if (value === undefined || value === null || value === '') return { kind: 'empty' };
	return { kind: 'text', text: String(value), bold: !!col.bold, italic: !!col.italic };
}
