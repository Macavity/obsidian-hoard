import { describe, it, expect } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { findWatchLogBase, findWatchLogPluginData, WATCHLOG_PLUGIN_IDS } from '../../../src/import/watchlog/detect';

const src = (files: Record<string, string>) => ({
	configDir: '.obsidian',
	adapter: {
		exists: (p: string) => Promise.resolve(p in files),
		read: (p: string) => (p in files ? Promise.resolve(files[p]!) : Promise.reject(new Error('ENOENT'))),
	},
});

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

describe('findWatchLogPluginData', () => {
	it('checks WatchLog Sync before WatchLog', async () => {
		expect(WATCHLOG_PLUGIN_IDS).toEqual(['watchlog-sync', 'watchlog']);
		const both = src({
			'.obsidian/plugins/watchlog-sync/data.json': '{"schemaVersion":2}',
			'.obsidian/plugins/watchlog/data.json': '{"titles":[]}',
		});
		expect(await findWatchLogPluginData(both)).toEqual({
			raw: { schemaVersion: 2 }, id: 'watchlog-sync', dir: '.obsidian/plugins/watchlog-sync',
		});
	});

	it('finds nothing when no WatchLog data.json exists', async () => {
		expect(await findWatchLogPluginData(src({}))).toBeNull();
	});
});
