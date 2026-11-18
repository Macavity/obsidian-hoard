import { describe, expect, it, vi } from 'vitest';
import { attempt, checkResultOf, errorMessage, FAILED, firstFound, found, NO_KEY, NOT_FOUND, type LookupSource } from '../src/shared/api/lookup';

const src = <T>(r: Awaited<ReturnType<LookupSource<T>>>): LookupSource<T> => vi.fn(() => Promise.resolve(r));

describe('firstFound', () => {
	it('returns the first found and skips later sources', async () => {
		const third = src(found('c'));
		expect(await firstFound([src(NOT_FOUND), src(found('a')), third])).toEqual(found('a'));
		expect(third).not.toHaveBeenCalled();
	});
	it('reports failed over notfound', async () => {
		expect(await firstFound([src(FAILED), src(NOT_FOUND)])).toEqual(FAILED);
	});
	it('reports notfound when all miss', async () => {
		expect(await firstFound([src(NOT_FOUND), src(NOT_FOUND)])).toEqual(NOT_FOUND);
	});
	it('counts a throwing source as failed', async () => {
		const boom: LookupSource<string> = () => Promise.reject(new Error('x'));
		expect(await firstFound([boom, src(NOT_FOUND)])).toEqual(FAILED);
	});
	it('skips nokey sources', async () => {
		expect(await firstFound([src(NO_KEY), src(NOT_FOUND)])).toEqual(NOT_FOUND);
		expect(await firstFound([src(NO_KEY)])).toEqual(NO_KEY);
		expect(await firstFound<string>([])).toEqual(NO_KEY);
	});
	it('still finds after a failure', async () => {
		expect(await firstFound([src(FAILED), src(found(1))])).toEqual(found(1));
	});
});

describe('attempt', () => {
	it('wraps values as found', async () => {
		expect(await attempt(() => Promise.resolve('v'))).toEqual(found('v'));
		expect(await attempt(() => Promise.resolve(0))).toEqual(found(0));
	});
	it('maps null, undefined and empty arrays to notfound', async () => {
		expect(await attempt(() => Promise.resolve(null))).toEqual(NOT_FOUND);
		expect(await attempt(() => Promise.resolve(undefined))).toEqual(NOT_FOUND);
		expect(await attempt(() => Promise.resolve([]))).toEqual(NOT_FOUND);
	});
	it('maps a throw to failed', async () => {
		expect(await attempt(() => Promise.reject(new Error()))).toEqual(FAILED);
	});
});

describe('checkResultOf', () => {
	it('maps each status', () => {
		expect(checkResultOf(found(1))).toBeNull();
		expect(checkResultOf(NOT_FOUND)).toBe('notfound');
		expect(checkResultOf(FAILED)).toBe('transient');
		expect(checkResultOf(NO_KEY)).toBe('nokey');
	});
});

describe('errorMessage', () => {
	it('reads the message of an Error or of any object that carries one', () => {
		expect(errorMessage(new Error('offline'))).toBe('offline');
		expect(errorMessage({ message: 'plain object' })).toBe('plain object');
	});
	it('is empty for anything else', () => {
		for (const thrown of ['text', null, undefined, 5, { message: 5 }]) expect(errorMessage(thrown)).toBe('');
	});
});
