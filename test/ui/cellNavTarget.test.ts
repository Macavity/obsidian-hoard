import { describe, expect, it } from 'vitest';
import { cellNavTarget } from '../../src/CustomListsTab';

// 3 rows, 4 editable cells per row
describe('cellNavTarget', () => {
	it('Tab walks right, wraps to the next row, appends a row after the last cell', () => {
		expect(cellNavTarget('tab', 0, 1, 3, 4)).toEqual({ row: 'same', col: 2 });
		expect(cellNavTarget('tab', 0, 3, 3, 4)).toEqual({ row: 1, col: 0 });
		expect(cellNavTarget('tab', 2, 3, 3, 4)).toEqual({ addRow: 0 });
	});

	it('Shift+Tab walks left, wraps to the last cell of the previous row, stops at the first cell', () => {
		expect(cellNavTarget('shift-tab', 1, 2, 3, 4)).toEqual({ row: 'same', col: 1 });
		expect(cellNavTarget('shift-tab', 1, 0, 3, 4)).toEqual({ row: 0, col: 'last' });
		expect(cellNavTarget('shift-tab', 0, 0, 3, 4)).toBeNull();
	});

	it('Enter goes down the same column and appends a row from the last one', () => {
		expect(cellNavTarget('enter', 0, 2, 3, 4)).toEqual({ row: 1, col: 2 });
		expect(cellNavTarget('enter', 2, 2, 3, 4)).toEqual({ addRow: 2 });
	});

	it('treats a cell outside the editable set as column 0', () => {
		expect(cellNavTarget('enter', 0, -1, 3, 4)).toEqual({ row: 1, col: 0 });
		expect(cellNavTarget('enter', 2, -1, 3, 4)).toEqual({ addRow: 0 });
		expect(cellNavTarget('tab', 0, -1, 3, 4)).toEqual({ row: 1, col: 0 });
	});
});
