import { describe, it, expect } from 'vitest';
import { loadOwnOrWatchLog } from '../../../src/migration/watchlog/pluginData';

const src = (files: Record<string, string>) => ({
	configDir: '.obsidian',
	adapter: {
		exists: (p: string) => Promise.resolve(p in files),
		read: (p: string) => (p in files ? Promise.resolve(files[p]!) : Promise.reject(new Error('ENOENT'))),
	},
});

const ownData = (raw: unknown) => () => Promise.resolve(raw);

const SYNC = '.obsidian/plugins/watchlog-sync/data.json';
const ORIGINAL = '.obsidian/plugins/watchlog/data.json';

describe('loadOwnOrWatchLog', () => {
	it('prefers own data', async () => {
		const own = { schemaVersion: 2, settings: {} };
		const r = await loadOwnOrWatchLog(ownData(own), src({ [SYNC]: '{"schemaVersion":2}', [ORIGINAL]: '{"titles":[]}' }));
		expect(r).toEqual({ raw: own });
	});

	it('adopts the schema-2 data of WatchLog Sync as-is while own is empty', async () => {
		for (const own of [null, undefined, {}]) {
			const r = await loadOwnOrWatchLog(ownData(own), src({ [SYNC]: '{"schemaVersion":2,"settings":{"draftsTag":"#watchlog"}}' }));
			expect(r).toEqual({ raw: { schemaVersion: 2, settings: { draftsTag: '#watchlog' } }, source: { id: 'watchlog-sync', dir: '.obsidian/plugins/watchlog-sync' } });
		}
	});

	it('adopts the WatchLog data when WatchLog Sync has none', async () => {
		const r = await loadOwnOrWatchLog(ownData(null), src({ [ORIGINAL]: '{"titles":[{"id":"a"}]}' }));
		expect(r).toEqual({ raw: { titles: [{ id: 'a' }] }, source: { id: 'watchlog', dir: '.obsidian/plugins/watchlog' } });
	});

	it('prefers WatchLog Sync over WatchLog', async () => {
		const r = await loadOwnOrWatchLog(ownData(null), src({ [SYNC]: '{"schemaVersion":2}', [ORIGINAL]: '{"titles":[]}' }));
		expect(r).toEqual({ raw: { schemaVersion: 2 }, source: { id: 'watchlog-sync', dir: '.obsidian/plugins/watchlog-sync' } });
	});

	it('falls through an empty or broken WatchLog Sync to WatchLog', async () => {
		for (const sync of ['{}', '{broken']) {
			const r = await loadOwnOrWatchLog(ownData(null), src({ [SYNC]: sync, [ORIGINAL]: '{"titles":[]}' }));
			expect(r).toEqual({ raw: { titles: [] }, source: { id: 'watchlog', dir: '.obsidian/plugins/watchlog' } });
		}
	});

	it('returns own data when every WatchLog plugin is missing, empty or broken', async () => {
		expect(await loadOwnOrWatchLog(ownData(null), src({}))).toEqual({ raw: null });
		expect(await loadOwnOrWatchLog(ownData(null), src({ [SYNC]: '{}', [ORIGINAL]: '{}' }))).toEqual({ raw: null });
		expect(await loadOwnOrWatchLog(ownData(null), src({ [SYNC]: '{broken', [ORIGINAL]: '{broken' }))).toEqual({ raw: null });
	});
});
