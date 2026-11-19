/** Small helpers shared by the data managers and codecs. */

/** A plain record: an object that is neither null nor a list. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** The own properties of a typed object as a plain record, for code that handles settings key by key. */
export const toRecord = (o: object): Record<string, unknown> => Object.fromEntries(Object.entries(o));

export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Keys whose encoded value differs between two frontmatter objects (present in either). */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !sameJson(before[k], after[k]));
}

/** `{ key: value }` when the value is set, else `{}`: optional properties stay out of the note. */
export function optional(key: string, value: unknown): Record<string, unknown> {
	return value ? { [key]: value } : {};
}

/** Drops keys whose value is undefined, so an optional field is absent instead of present-and-undefined. */
export function defined<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> };
export function defined(o: object): object {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/** A copy of the object without `key`: absent, not present-and-undefined. Keeps the baseline symbol like a spread. */
export function omit<T extends object, K extends keyof T>(o: T, key: K): T extends unknown ? Omit<T, K> : never;
export function omit(o: object, key: PropertyKey): object {
	const rest = { ...o };
	Reflect.deleteProperty(rest, key);
	return rest;
}

/** The list when it has entries, else undefined: an empty list is written as an absent field. */
export const nonEmpty = <T>(v: T[] | undefined): T[] | undefined => (v && v.length > 0 ? v : undefined);

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
