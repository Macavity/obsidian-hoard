import { describe, expect, it } from 'vitest';
import {
	excludeAllOptions,
	includeAllOptions,
	isSectionAllIncluded,
	toggleSectionAll,
} from '../../src/design-system/filterDraft';

const section = (opts: string[], excluded: string[] = []) => ({ opts, excludeSet: new Set(excluded) });

describe('filterDraft', () => {
	it('includeAllOptions clears every exclude set', () => {
		const a = section(['a', 'b'], ['a']);
		const b = section(['c'], ['c']);
		includeAllOptions([a, b]);
		expect(a.excludeSet.size).toBe(0);
		expect(b.excludeSet.size).toBe(0);
	});

	it('excludeAllOptions excludes every option of every section', () => {
		const a = section(['a', 'b']);
		const b = section(['c']);
		excludeAllOptions([a, b]);
		expect([...a.excludeSet]).toEqual(['a', 'b']);
		expect([...b.excludeSet]).toEqual(['c']);
	});

	it('isSectionAllIncluded is false for an empty section', () => {
		expect(isSectionAllIncluded(section([]))).toBe(false);
	});

	it('isSectionAllIncluded is true only when nothing is excluded', () => {
		expect(isSectionAllIncluded(section(['a', 'b']))).toBe(true);
		expect(isSectionAllIncluded(section(['a', 'b'], ['a']))).toBe(false);
	});

	it('toggleSectionAll excludes everything when all are included', () => {
		const s = section(['a', 'b']);
		toggleSectionAll(s);
		expect([...s.excludeSet].sort()).toEqual(['a', 'b']);
	});

	it('toggleSectionAll clears the excludes when some are excluded', () => {
		const s = section(['a', 'b'], ['a']);
		toggleSectionAll(s);
		expect(s.excludeSet.size).toBe(0);
	});

	it('toggleSectionAll leaves an empty section empty', () => {
		const s = section([]);
		toggleSectionAll(s);
		expect(s.excludeSet.size).toBe(0);
	});
});
