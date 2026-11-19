import type { CustomListColumn, CustomListRow } from '../../shared/domain/columns';

// Maybe types

export interface CustomList {
	name: string;
	columns: CustomListColumn[];
	rows: CustomListRow[];
	notes: string;
	tabColor?: string; // hex; colours this list's tab name. Unset = default.
	/** width in px for the built-in Name column; absent = default flex width */
	nameWidth?: number;
}

// Drafts types
