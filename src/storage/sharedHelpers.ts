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

/** Drops keys whose value is undefined, so an optional field is absent instead of present-and-undefined. */
export function defined<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** The list when it has entries, else undefined: an empty list is written as an absent field. */
export const nonEmpty = <T>(v: T[] | undefined): T[] | undefined => (v && v.length > 0 ? v : undefined);

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
