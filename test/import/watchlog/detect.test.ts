import { describe, it, expect } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { readFileSync } from 'node:fs';
import { detectWatchLogSources, findWatchLogBase } from '../../../src/import/watchlog/detect';
import { snapshot } from './helpers';
import type { WatchLogData } from '../../../src/import/watchlog/schema1Types';

const data = JSON.parse(readFileSync('test/fixtures/data-v1.json', 'utf8')) as WatchLogData;

describe('findWatchLogBase', () => {
	it('finds a WatchLog.base by name, even without its key', async () => {
		const { app } = createFakeApp({ 'Media/WatchLog.base': 'views: []\n' });
		expect((await findWatchLogBase(app))?.path).toBe('Media/WatchLog.base');
	});

	it('finds any base with a top-level watchlog key; the first path wins', async () => {
		const { app } = createFakeApp({
			'b/Mine.base': 'watchlog:\n  version: 1\n',
			'a/Other.base': 'filters: {}\nwatchlog:\n  version: 1\n',
			'0/Nested.base': 'views:\n  watchlog: 1\n',
		});
		expect((await findWatchLogBase(app))?.path).toBe('a/Other.base');
	});

	it('finds nothing in a Hoard vault', async () => {
		const { app } = createFakeApp({ 'H/Hoard.base': 'hoard:\n  version: 1\n', 'H/Note.md': 'watchlog:\n' });
		expect(await findWatchLogBase(app)).toBeNull();
	});
});

describe('detectWatchLogSources', () => {
	it('finds original and fork without writing', async () => {
		const f = createFakeApp({
			'WatchLog/WatchLog.base': 'watchlog:\n  settings: {}\n',
			'WatchLog/Movie/Heat.md': '---\ntitle: Heat\n---\n',
		});
		f.adapterFiles.set('.obsidian/plugins/watchlog/data.json', JSON.stringify(data));
		f.adapterFiles.set('.obsidian/plugins/watchlog-sync/data.json', JSON.stringify({
			schemaVersion: 2, settings: { tmdbApiKey: 'k' }, cache: {}, ui: {},
		}));
		const before = snapshot(f);
		const s = await detectWatchLogSources(f.app);
		expect(s.original?.counts.titles).toBe(data.titles.length);
		expect(s.fork?.root).toBe('WatchLog');
		expect(s.fork?.counts).toMatchObject({ titles: 1, notes: 1 });
		expect(s.fork?.data?.settings).toEqual({ tmdbApiKey: 'k' });
		expect(s.hoardHasData).toBe(false);
		expect(snapshot(f)).toEqual(before);
	});

	it('treats unreadable data.json as absent', async () => {
		const f = createFakeApp({});
		f.adapterFiles.set('.obsidian/plugins/watchlog/data.json', '{nope');
		expect((await detectWatchLogSources(f.app)).original).toBeNull();
	});

	it('reports hoardHasData when a hoard: base exists', async () => {
		const f = createFakeApp({ 'Hoard/Hoard.base': 'hoard:\n  settings: {}\n' });
		expect((await detectWatchLogSources(f.app)).hoardHasData).toBe(true);
	});

	it('uses configured type names, counts other folders and skips a nested Hoard root', async () => {
		const f = createFakeApp({
			'WL.base': 'watchlog:\n  settings:\n    types:\n      - name: Film\n',
			'Film/A.md': '', 'Movie/B.md': '', 'Books/C.md': '', 'CustomLists/D.md': '',
			'Hoard/Hoard.base': 'hoard:\n', 'Hoard/Film/E.md': '',
		});
		const s = await detectWatchLogSources(f.app);
		expect(s.fork?.root).toBe('');
		expect(s.fork?.typeNames).toEqual(['Film']);
		expect(s.fork?.counts).toEqual({ titles: 1, books: 1, manga: 0, games: 0, lists: 1, notes: 3 });
	});
});
