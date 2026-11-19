/** The types a custom column can have (a list's and a reading column's alike). */
export const COLUMN_TYPES = ['text', 'number', 'select'] as const;

export interface CustomListColumn {
	id: string;
	label: string;
	type: 'text' | 'number' | 'select';
	locked?: boolean;
	options?: string[];   // only for type: 'select'
	optionColors?: Record<string, string>; // option value → hex; only for type: 'select'
	bold?: boolean;       // only for type: 'text' | 'number'
	italic?: boolean;     // only for type: 'text' | 'number'
	autoTime?: boolean;   // only for type: 'number' — auto-populate with remaining watch time
	/** rendered width in px; absent = default flex width. dropped with the column */
	width?: number;
}

export interface CustomListRow {
	id: string;
	checked?: boolean;
	[key: string]: string | number | boolean | undefined;
}
