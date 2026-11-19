import { describe, expect, it } from 'vitest';
import { draftTitlesInLine } from '../src/modules/drafts/domain/draftScan';

describe('draftTitlesInLine', () => {
	it('splits the rest after the tag on commas', () => {
		expect(draftTitlesInLine('see #hoard Dune, Alien', '#hoard')).toEqual(['Dune', 'Alien']);
	});
	it('returns nothing for a bare tag or a line without the tag', () => {
		expect(draftTitlesInLine('#hoard', '#hoard')).toEqual([]);
		expect(draftTitlesInLine('#hoard   ', '#hoard')).toEqual([]);
		expect(draftTitlesInLine('no tag', '#hoard')).toEqual([]);
	});
	it('drops segments over 100 characters and keeps those of exactly 100', () => {
		expect(draftTitlesInLine(`#hoard ${'x'.repeat(101)}`, '#hoard')).toEqual([]);
		expect(draftTitlesInLine(`#hoard ${'x'.repeat(100)}`, '#hoard')).toEqual(['x'.repeat(100)]);
	});
	it('skips empty segments', () => {
		expect(draftTitlesInLine('#hoard a,,b', '#hoard')).toEqual(['a', 'b']);
	});
	it('only the first occurrence of the tag counts', () => {
		expect(draftTitlesInLine('#hoard a #hoard b', '#hoard')).toEqual(['a #hoard b']);
	});
});
