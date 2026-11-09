/** What the UI says about a review item; translated there, since this module stays i18n-free. */
export type ReviewCode = 'maybe' | 'notAFile' | 'invalidYaml' | 'keptValue' | 'failed';

/** A file the user should look at after an import. */
export interface ReviewItem {
	path: string;
	/** `exists`: target was already there; `kept-value`: Hoard's differing value was kept; `error`: failed. */
	reason: 'exists' | 'kept-value' | 'error';
	/** Detail beyond the reason; `params` fill the translated text. */
	code?: ReviewCode;
	params?: Record<string, string>;
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

/** Errors without a review item of their own (a whole import failed); per-file errors are review items. */
export function generalErrors(r: ImportReport): string[] {
	const items = r.review.filter((i) => i.reason === 'error').map((i) => `${i.path}: `);
	return r.errors.filter((e) => !items.some((p) => e.startsWith(p)));
}
