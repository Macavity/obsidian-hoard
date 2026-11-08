/** A file the user should look at after an import. */
export interface ReviewItem {
	path: string;
	/** `exists`: target was already there; `kept-value`: Hoard's differing value was kept; `error`: failed. */
	reason: 'exists' | 'kept-value' | 'error';
	detail: string;
}

export interface ImportReport {
	created: number;
	filled: number;
	review: ReviewItem[];
	errors: string[];
}

export type ImportPhase = 'notes' | 'history' | 'base' | 'settings';
export type Progress = (phase: ImportPhase, done: number, total: number) => void;

export const emptyImportReport = (): ImportReport => ({ created: 0, filled: 0, review: [], errors: [] });
