import type { ApiCheckResult } from './storage/storageTypes';
import { at, readString } from './storage/read';

export type LookupResult<T> =
	| { status: 'found'; value: T }
	| { status: 'notfound' }
	| { status: 'failed' }
	| { status: 'nokey' };

export type LookupSource<T> = () => Promise<LookupResult<T>>;

export const found = <T>(value: T): LookupResult<T> => ({ status: 'found', value });
export const NOT_FOUND = { status: 'notfound' } as const;
export const FAILED = { status: 'failed' } as const;
export const NO_KEY = { status: 'nokey' } as const;

/** First found wins. A throwing source counts as failed; nokey sources are skipped.
 *  After all sources: any failed → failed; else any notfound → notfound; else nokey (incl. empty list). */
export async function firstFound<T>(sources: readonly LookupSource<T>[]): Promise<LookupResult<T>> {
	let failed = false;
	let missed = false;
	for (const source of sources) {
		let result: LookupResult<T>;
		try {
			result = await source();
		} catch {
			result = FAILED;
		}
		if (result.status === 'found') return result;
		if (result.status === 'failed') failed = true;
		else if (result.status === 'notfound') missed = true;
	}
	if (failed) return FAILED;
	return missed ? NOT_FOUND : NO_KEY;
}

/** Adapts a call: value → found, null/undefined/empty array → notfound, throw → failed
 *  (or whatever `onError` makes of the error, e.g. a classified 404 → notfound). */
export async function attempt<T>(
	call: () => Promise<T | null | undefined>,
	onError: (err: unknown) => LookupResult<never> = () => FAILED,
): Promise<LookupResult<T>> {
	try {
		const value = await call();
		if (value === null || value === undefined) return NOT_FOUND;
		if (Array.isArray(value) && value.length === 0) return NOT_FOUND;
		return found(value);
	} catch (err) {
		return onError(err);
	}
}

/** found → null (nothing to record); notfound → 'notfound'; failed → 'transient'; nokey → 'nokey'. */
export function checkResultOf(r: LookupResult<unknown>): ApiCheckResult | null {
	switch (r.status) {
		case 'found':
			return null;
		case 'notfound':
			return 'notfound';
		case 'failed':
			return 'transient';
		case 'nokey':
			return 'nokey';
	}
}

/** The message of whatever was thrown ('' when it carries none) — a catch binding is `unknown`. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : readString(at(err, 'message'));
}
