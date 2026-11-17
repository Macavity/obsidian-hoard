import { isRecord } from './sharedHelpers';

/** Tolerant readers for data of unknown shape (API payloads, stored JSON, properties). Pure; never throw. */

export function readString(v: unknown, fallback = ''): string {
	return typeof v === 'string' ? v : fallback;
}

export function readOptionalString(v: unknown): string | undefined {
	return typeof v === 'string' && v !== '' ? v : undefined;
}

export function readNumber(v: unknown, fallback = 0): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function readOptionalNumber(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function readBoolean(v: unknown, fallback = false): boolean {
	return typeof v === 'boolean' ? v : fallback;
}

export function readList<T>(v: unknown, readItem: (item: unknown) => T | undefined): T[] {
	if (!Array.isArray(v)) return [];
	const out: T[] = [];
	const items: unknown[] = v;
	for (const item of items) {
		const read = readItem(item);
		if (read !== undefined) out.push(read);
	}
	return out;
}

export function readStringList(v: unknown): string[] {
	return readList(v, (item) => (typeof item === 'string' ? item : undefined));
}

export function readOneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.find((a) => a === v) ?? fallback;
}

export function readRecord(v: unknown): Record<string, unknown> {
	return isRecord(v) ? v : {};
}

/** Walks records and arrays along `path`; `undefined` as soon as a step is missing or not a container. */
export function at(v: unknown, ...path: (string | number)[]): unknown {
	let cur: unknown = v;
	for (const step of path) {
		if (typeof step === 'number') {
			if (!Array.isArray(cur)) return undefined;
			const arr: unknown[] = cur;
			cur = arr[step];
		} else {
			if (!isRecord(cur)) return undefined;
			cur = cur[step];
		}
	}
	return cur;
}
