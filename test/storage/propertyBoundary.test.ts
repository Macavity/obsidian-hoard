import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CODECS = ['titleCodec', 'readingCodec', 'gameCodec'].map((n) => `src/storage/${n}.ts`);
const MANAGERS = ['DataManager', 'ReadingDataManager', 'GameDataManager'].map((n) => `src/${n}.ts`);

const Q = `['"]`; // either quote style
const NO_LITERALS: Array<[string, RegExp]> = [
	['reader call with a literal name', new RegExp(String.raw`\br\.(str|num|bool|list|date)\(\s*${Q}`)],
	['out dot write', /\bout\.[a-zA-Z]+\s*=/],
	['out bracket write with a string literal', new RegExp(String.raw`\bout\[\s*${Q}`)],
	['fm dot access', /\bfm\.[a-zA-Z]+/],
	['fm bracket access with a string literal', new RegExp(String.raw`\bfm\[\s*${Q}`)],
];
const NO_RAW: Array<[string, RegExp]> = [
	['raw dot access', /\braw\.[a-zA-Z]+/],
	['raw bracket access with a string literal', new RegExp(String.raw`\braw\[\s*${Q}`)],
];

function violations(files: string[], rules: Array<[string, RegExp]>): string[] {
	return files.flatMap((file) => {
		const src = readFileSync(file, 'utf8');
		return rules.filter(([, re]) => re.test(src)).map(([name]) => `${file}: ${name}`);
	});
}

describe('property name boundary', () => {
	it('codecs and managers read and write frontmatter only through the property constants', () => {
		expect(violations([...CODECS, ...MANAGERS], NO_LITERALS)).toEqual([]);
	});
	it('managers touch raw frontmatter only through the property constants', () => {
		expect(violations([...CODECS, ...MANAGERS], NO_RAW)).toEqual([]);
	});
	it('rules catch the literal forms and allow constants and templates', () => {
		const hit = (rules: Array<[string, RegExp]>, code: string): boolean => rules.some(([, re]) => re.test(code));
		for (const code of [`raw['title']`, `raw["title"]`, `out["x"] = 1`, `fm['x']`, `fm.x`, `r.str("x")`, `r.num('x')`]) {
			expect(hit([...NO_LITERALS, ...NO_RAW], code), code).toBe(true);
		}
		for (const code of ['raw[COMMON_PROPS.cover]', 'out[TITLE_PROPS.x] = 1', 'out[customFieldKey(c.name)] = v', 'r.str(COMMON_PROPS.name)']) {
			expect(hit([...NO_LITERALS, ...NO_RAW], code), code).toBe(false);
		}
	});
});
