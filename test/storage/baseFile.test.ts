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
	it('ignores blocks under other keys', () => {
		const other = `${src}other:\n  version: 1\n`;
		expect(base.hasHoardKey(other)).toBe(false);
		expect(base.readHoardBlock(other, yaml)).toBeNull();
		expect(base.hasTopLevelKey(other, 'other')).toBe(true);
	});
});

describe('inFolder filter line', () => {
	const find = base.findInFolderPath;

	it('needs a top-level "filters:" key with nothing after it', () => {
		expect(find('views:\n  - type: table\n')).toBeNull();
		expect(find('filters: {}\n  and:\n    - file.inFolder("X")\n')).toBeNull();
		expect(find('  filters:\n    and:\n      - file.inFolder("X")\n')).toBeNull();
	});

	it('finds the line as a later item and skips blank lines', () => {
		expect(find('filters:\n  and:\n    - status != "x"\n    - file.inFolder("Second")\n')).toBe('Second');
		expect(find('filters:\n\n  and:\n\n    - a\n\n    - file.inFolder("Blank")\n')).toBe('Blank');
	});

	it('finds an "and:" that sits deeper inside the filters block', () => {
		expect(find('filters:\n  or:\n    and:\n      - file.inFolder("Deep")\n')).toBe('Deep');
	});

	it('stops at the next top-level key', () => {
		expect(find('filters:\n  or:\n    - a\nviews:\n  and:\n    - file.inFolder("V")\n')).toBeNull();
	});

	it('stops when the indentation returns to the level of "and:"', () => {
		expect(find('filters:\n  and:\n    - a\n  not:\n    - file.inFolder("N")\n')).toBeNull();
		expect(find('filters:\n  and:\nviews:\n    - file.inFolder("N")\n')).toBeNull();
	});

	it('takes only items at the indentation of the first item', () => {
		expect(find('filters:\n  and:\n    - or:\n        - file.inFolder("Inner")\n    - a\n')).toBeNull();
		expect(find('filters:\n  and:\n      - a\n    - file.inFolder("Outer")\n')).toBeNull();
		expect(find('filters:\n  and:\n    - or:\n        - b\n    - file.inFolder("Sibling")\n')).toBe('Sibling');
	});

	it('accepts trailing spaces and Windows line ends', () => {
		expect(find('filters:\n  and:\n    - file.inFolder("T")  \n')).toBe('T');
		expect(find('filters:\r\n  and:\r\n    - file.inFolder("W")\r\n')).toBe('W');
	});

	it('does not take a line that only contains the call', () => {
		expect(find('filters:\n  and:\n    - file.inFolder("A") && x\n')).toBeNull();
		expect(find('filters:\n  and:\n    - "file.inFolder("A")"\n')).toBeNull();
	});

	it('escapes quotes and backslashes in the path and reads them back', () => {
		const out = base.replaceInFolderPath(src, 'A "B"\\C')!;
		expect(out).toContain('    - file.inFolder("A \\"B\\"\\\\C")\n');
		expect(find(out)).toBe('A "B"\\C');
	});

	it('leaves every other byte alone when replacing', () => {
		expect(base.replaceInFolderPath(src, 'Media/Hoard')).toBe(src.replace('Journal/Hoard', 'Media/Hoard'));
		expect(base.replaceInFolderPath('filters:\r\n  and:\r\n    - file.inFolder("W")  \r\nx: 1\r\n', 'Z'))
			.toBe('filters:\r\n  and:\r\n    - file.inFolder("Z")  \r\nx: 1\r\n');
		expect(base.replaceInFolderPath('views:\n  - type: table\n', 'Z')).toBeNull();
	});
});
