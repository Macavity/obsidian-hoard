import type { Fm } from './storageTypes';

/** Small helpers shared by the data managers and codecs. */

export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Keys whose encoded value differs between two frontmatter objects (present in either). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !sameJson(before[k], after[k]));
}

/** `{ key: value }` when the value is set, else `{}`: optional properties stay out of the note. */
export function optional(key: string, value: unknown): Fm {
	return value ? { [key]: value } : {};
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
