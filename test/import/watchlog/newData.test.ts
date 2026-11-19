import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kindsWithNewData } from '../../../src/modules/import/services/watchlog/newData';
import { detectWatchLogSources } from '../../../src/modules/import/services/watchlog/detect';
import { setupCleanup } from './setupCleanup';
import { WATCHLOG_NOTES } from './setupSchema1';

const FORK = {
	'WatchLog/WatchLog.base': 'watchlog:\n  types:\n    - name: Movie\n',
	'WatchLog/Movie/Heat.md': 'a',
	'Hoard/Hoard.base': 'hoard:\n  settings: {}\n',
};

const DATA = readFileSync('test/fixtures/data-v1.json', 'utf8');

/** Every note the original import writes for data-v1.json, plus its custom list. */
const ORIGINAL_IN_HOARD = {
	'Hoard/Movie/A.md': 'x', 'Hoard/TV Show/Dark.md': 'x', 'Hoard/Movie/Das doppelte Lottchen.md': 'x',
	'Hoard/Movie/Maybe Film.md': 'x', 'Hoard/Books/Dune.md': 'x', 'Hoard/Manga/Berserk.md': 'x', 'Hoard/Games/Hades.md': 'x',
	'Hoard/CustomLists/Shopping.md': 'x',
};

const without = (path: string): Record<string, string> =>
	Object.fromEntries(Object.entries(ORIGINAL_IN_HOARD).filter(([p]) => p !== path));

async function setupOriginal(files: Record<string, string>) {
	const { f, layout } = await setupCleanup({ ...WATCHLOG_NOTES, ...files }, ['Movie', 'TV Show']);
	f.adapterFiles.set('.obsidian/plugins/watchlog/data.json', DATA);
	const sources = await detectWatchLogSources(f.app.vault, () => false);
	return { f, sources, layout };
}

describe('kindsWithNewData', () => {
	it('offers the fork while a file has no copy in Hoard', async () => {
		const { f, sources, layout } = await setupCleanup(FORK);
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['fork'])).toEqual(['fork']);
	});

	it('skips the fork when Hoard holds every file (imported on another device)', async () => {
		const { f, sources, layout } = await setupCleanup({ ...FORK, 'Hoard/Movie/Heat.md': 'a' });
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['fork'])).toEqual([]);
	});

	it('offers the original while an entry has no Hoard note', async () => {
		const { f, sources, layout } = await setupOriginal(without('Hoard/Games/Hades.md'));
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['original'])).toEqual(['original']);
	});

	it('offers the original while a Maybe title has no Hoard note', async () => {
		const { f, sources, layout } = await setupOriginal(without('Hoard/Movie/Maybe Film.md'));
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['original'])).toEqual(['original']);
	});

	it('offers the original while a custom list has no Hoard copy', async () => {
		const { f, sources, layout } = await setupOriginal(without('Hoard/CustomLists/Shopping.md'));
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['original'])).toEqual(['original']);
	});

	it('skips the original when Hoard has a note for every entry and list', async () => {
		const { f, sources, layout } = await setupOriginal(ORIGINAL_IN_HOARD);
		expect(sources.original).not.toBeNull();
		expect(await kindsWithNewData(f.app.vault, sources, layout, ['original'])).toEqual([]);
	});

	it('checks only the kinds asked for', async () => {
		const { f, sources, layout } = await setupCleanup(FORK);
		expect(await kindsWithNewData(f.app.vault, sources, layout, [])).toEqual([]);
	});
});
