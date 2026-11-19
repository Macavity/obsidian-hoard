import type { CustomListColumn } from '../../../shared/domain/columns';

/** Result of analysing the pasted TSV against the list's current columns. */
export interface ImportAnalysis {
	header: string[];
	dataRows: string[][];
	rowCount: number;
	/** Max column count across every pasted line (header + data). */
	totalCols: number;
	/** How many existing data columns there are (Name + non-locked). */
	existingCount: number;
	/** New text columns auto-created to match wider pasted data. */
	newColCount: number;
	/** Per select column: distinct new option values that will be added. */
	selectAdditions: { label: string; values: string[] }[];
	/** Labels of number columns receiving non-numeric values (blocking). */
	numberConflicts: string[];
}

interface ImportConflicts {
	numberConflicts: Set<string>;
	selectNewValues: Map<number, { label: string; values: Set<string> }>;
}

function checkCell(col: CustomListColumn, cell: string, index: number, found: ImportConflicts): void {
	const label = col.label || '(unnamed)';
	if (col.type === 'number') {
		if (!Number.isFinite(Number(cell))) found.numberConflicts.add(label);
		return;
	}
	if (col.type !== 'select' || (col.options ?? []).includes(cell)) return;
	let entry = found.selectNewValues.get(index);
	if (!entry) {
		entry = { label, values: new Set() };
		found.selectNewValues.set(index, entry);
	}
	entry.values.add(cell);
}

/** Compares parsed pasted rows with the existing positional columns (Name + non-locked). */
export function analyseImport(
	parsed: { header: string[]; dataRows: string[][] },
	nonLocked: readonly CustomListColumn[],
): ImportAnalysis {
	const existingCount = 1 + nonLocked.length; // Name + non-locked columns
	const totalCols = Math.max(parsed.header.length, ...parsed.dataRows.map(r => r.length));
	const found: ImportConflicts = { numberConflicts: new Set(), selectNewValues: new Map() };

	for (const row of parsed.dataRows) {
		for (let i = 1; i < row.length && i < existingCount; i++) {
			const col = nonLocked[i - 1]!; // i === 0 is Name (text, no conflict)
			const cell = row[i]!;
			if (cell !== '') checkCell(col, cell, i, found);
		}
	}

	return {
		header: parsed.header,
		dataRows: parsed.dataRows,
		rowCount: parsed.dataRows.length,
		totalCols,
		existingCount,
		newColCount: Math.max(0, totalCols - existingCount),
		selectAdditions: [...found.selectNewValues.values()].map(e => ({ label: e.label, values: [...e.values] })),
		numberConflicts: [...found.numberConflicts],
	};
}
