import { describe, expect, it } from 'vitest';
import { analyseImport } from '../src/modules/custom-lists/domain/importAnalysis';
import type { CustomListColumn } from '../src/shared/domain/columns';

const cols: CustomListColumn[] = [
	{ id: 'c1', label: 'Score', type: 'number' },
	{ id: 'c2', label: 'Tag', type: 'select', options: ['a'] },
];

describe('analyseImport', () => {
	it('reports number conflicts, new select values and column counts', () => {
		const a = analyseImport({ header: ['Name', 'Score', 'Tag'], dataRows: [['N', 'x', 'b'], ['M', '3', 'a', 'extra']] }, cols);
		expect(a.numberConflicts).toEqual(['Score']);
		expect(a.selectAdditions).toEqual([{ label: 'Tag', values: ['b'] }]);
		expect(a.totalCols).toBe(4);
		expect(a.existingCount).toBe(3);
		expect(a.newColCount).toBe(1);
		expect(a.rowCount).toBe(2);
	});

	it('does not flag empty cells', () => {
		const a = analyseImport({ header: [], dataRows: [['N', '', '']] }, cols);
		expect(a.numberConflicts).toEqual([]);
		expect(a.selectAdditions).toEqual([]);
	});

	it('labels unnamed columns', () => {
		const a = analyseImport(
			{ header: [], dataRows: [['N', 'x', 'z']] },
			[{ id: 'c1', label: '', type: 'number' }, { id: 'c2', label: '', type: 'select', options: [] }],
		);
		expect(a.numberConflicts).toEqual(['(unnamed)']);
		expect(a.selectAdditions).toEqual([{ label: '(unnamed)', values: ['z'] }]);
	});
});
