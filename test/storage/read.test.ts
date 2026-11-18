import { describe, expect, it } from 'vitest';
import {
	at,
	readBoolean,
	readList,
	readNumber,
	readOneOf,
	readOptionalNumber,
	readOptionalString,
	readRecord,
	readString,
	readStringList,
} from '../../src/shared/domain/read';

describe('readString', () => {
	it('keeps strings and falls back otherwise', () => {
		expect(readString('a')).toBe('a');
		expect(readString(5)).toBe('');
		expect(readString(5, 'x')).toBe('x');
		expect(readString(null)).toBe('');
	});
});

describe('readOptionalString', () => {
	it('returns non-empty strings only', () => {
		expect(readOptionalString('a')).toBe('a');
		expect(readOptionalString('')).toBeUndefined();
		expect(readOptionalString(1)).toBeUndefined();
	});
});

describe('readNumber', () => {
	it('keeps finite numbers only', () => {
		expect(readNumber(3)).toBe(3);
		expect(readNumber(NaN)).toBe(0);
		expect(readNumber(Infinity, 7)).toBe(7);
		expect(readNumber('3')).toBe(0);
	});
});

describe('readOptionalNumber', () => {
	it('returns finite numbers only', () => {
		expect(readOptionalNumber(0)).toBe(0);
		expect(readOptionalNumber(NaN)).toBeUndefined();
		expect(readOptionalNumber('1')).toBeUndefined();
	});
});

describe('readBoolean', () => {
	it('keeps booleans and falls back otherwise', () => {
		expect(readBoolean(true)).toBe(true);
		expect(readBoolean('true')).toBe(false);
		expect(readBoolean(undefined, true)).toBe(true);
	});
});

describe('readStringList', () => {
	it('drops non-strings and non-arrays', () => {
		expect(readStringList(['a', 1, null, 'b'])).toEqual(['a', 'b']);
		expect(readStringList('a')).toEqual([]);
	});
});

describe('readList', () => {
	it('maps items and drops undefined results', () => {
		const items = readList([1, 'x', 2], (i) => (typeof i === 'number' ? i * 2 : undefined));
		expect(items).toEqual([2, 4]);
		expect(readList({}, () => 1)).toEqual([]);
	});
});

describe('readOneOf', () => {
	it('accepts allowed values only', () => {
		expect(readOneOf('tv', ['movie', 'tv'] as const, 'movie')).toBe('tv');
		expect(readOneOf('x', ['movie', 'tv'] as const, 'movie')).toBe('movie');
		expect(readOneOf(1, ['movie', 'tv'] as const, 'movie')).toBe('movie');
	});
});

describe('readRecord', () => {
	it('returns records and {} for everything else', () => {
		expect(readRecord({ a: 1 })).toEqual({ a: 1 });
		expect(readRecord([])).toEqual({});
		expect(readRecord(null)).toEqual({});
	});
});

describe('at', () => {
	it('walks records and arrays', () => {
		expect(at({ data: { trailer: { id: 'k' } } }, 'data', 'trailer', 'id')).toBe('k');
		expect(at({ a: [{ b: 1 }] }, 'a', 0, 'b')).toBe(1);
		expect(at({ a: 1 })).toEqual({ a: 1 });
	});
	it('gives undefined when a step is missing or not a container', () => {
		expect(at({ data: null }, 'data', 'x')).toBeUndefined();
		expect(at({ a: 'str' }, 'a', 0)).toBeUndefined();
		expect(at({ a: [] }, 'a', 3)).toBeUndefined();
		expect(at(undefined, 'a')).toBeUndefined();
	});
});
