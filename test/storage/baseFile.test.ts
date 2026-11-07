import { describe, it, expect } from 'vitest';
import { parse, stringify } from 'yaml';
import * as base from '../../src/storage/baseFile';

const yaml = { parse, stringify };
const src = `improved-bases:
  icon: 🎬
filters:
  and:
    - file.inFolder("Journal/Hoard")
    - status != "Dropped"
views:
  - type: table
    name: All   # user comment
`;

describe('baseFile', () => {
	it('adds and replaces the hoard block without touching the rest', () => {
		const a = base.writeHoardBlock(src, { version: 1, statuses: [] }, yaml);
		expect(base.hasHoardKey(a)).toBe(true);
		expect(a).toContain('improved-bases:\n  icon: 🎬');
		expect(a).toContain('name: All   # user comment');
		const b = base.writeHoardBlock(a, { version: 1, statuses: [{ name: 'X', color: '#fff' }] }, yaml);
		expect(base.readHoardBlock(b, yaml)).toEqual({ version: 1, statuses: [{ name: 'X', color: '#fff' }] });
		expect(b.match(/^hoard:/gm)?.length).toBe(1);
	});
	it('keeps surrounding text byte-identical when replacing a mid-file block', () => {
		const mid = `a: 1\nhoard:\n  version: 1\n\n# note\nb: 2\n`;
		const out = base.writeHoardBlock(mid, { version: 2 }, yaml);
		expect(out).toBe(`a: 1\nhoard:\n  version: 2\n\n# note\nb: 2\n`);
	});
	it('finds and replaces the inFolder line', () => {
		expect(base.findInFolderPath(src)).toBe('Journal/Hoard');
		const r = base.replaceInFolderPath(src, 'Media/Hoard')!;
		expect(base.findInFolderPath(r)).toBe('Media/Hoard');
		expect(r).toContain('- status != "Dropped"');
	});
	it('returns null when the line is gone', () => {
		expect(base.replaceInFolderPath('filters:\n  or:\n    - file.inFolder("x")\n', 'y')).toBeNull();
		expect(base.findInFolderPath('filters:\n  or:\n    - file.inFolder("x")\n')).toBeNull();
	});
	it('returns null block when key is missing', () => {
		expect(base.hasHoardKey(src)).toBe(false);
		expect(base.readHoardBlock(src, yaml)).toBeNull();
	});
	it('creates a parseable base', () => {
		const c = base.createBaseFile('Hoard', { version: 1 }, yaml);
		expect(base.findInFolderPath(c)).toBe('Hoard');
		expect((yaml.parse(c) as { views: unknown[] }).views.length).toBe(1);
	});
	it('reads a legacy watchlog block', () => {
		const legacy = `${src}watchlog:\n  version: 1\n  halfStarRatings: true\n`;
		expect(base.hasHoardKey(legacy)).toBe(true);
		expect(base.readHoardBlock(legacy, yaml)).toEqual({ version: 1, halfStarRatings: true });
	});
	it('prefers the hoard block over a legacy one', () => {
		const both = 'watchlog:\n  version: 1\nhoard:\n  version: 2\n';
		expect(base.readHoardBlock(both, yaml)).toEqual({ version: 2 });
	});
	it('rewrites a legacy block under hoard and drops the watchlog key', () => {
		const legacy = `a: 1\nwatchlog:\n  version: 1\n\n# note\nb: 2\n`;
		const out = base.writeHoardBlock(legacy, { version: 2 }, yaml);
		expect(out).toBe(`a: 1\nhoard:\n  version: 2\n\n# note\nb: 2\n`);
	});
});
