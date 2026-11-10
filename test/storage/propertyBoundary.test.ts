import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CODECS = ['titleCodec', 'readingCodec', 'gameCodec'].map((n) => `src/storage/${n}.ts`);
const MANAGERS = ['DataManager', 'ReadingDataManager', 'GameDataManager'].map((n) => `src/${n}.ts`);

describe('property name boundary', () => {
	it('codecs read and write frontmatter only through the property constants', () => {
		for (const file of CODECS) {
			const src = readFileSync(file, 'utf8');
			expect(src, file).not.toMatch(/\br\.(str|num|bool|list|date)\('/);
			expect(src, file).not.toMatch(/\bout\.[a-zA-Z]+\s*=/);
			expect(src, file).not.toMatch(/\bfm\.[a-zA-Z]+/);
		}
	});
	it('managers touch raw frontmatter only through the property constants', () => {
		for (const file of [...CODECS, ...MANAGERS]) {
			expect(readFileSync(file, 'utf8'), file).not.toMatch(/\braw\.[a-zA-Z]+/);
		}
	});
});
