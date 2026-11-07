import { describe, it, expect } from 'vitest';
import { loadOwnOrOriginal } from '../../src/storage/legacyPlugin';

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

describe('loadOwnOrOriginal', () => {
	it('prefers own data', async () => {
		const own = { schemaVersion: 2, settings: {} };
		const r = await loadOwnOrOriginal(ownData(own), src({ [SYNC]: '{"schemaVersion":2}', [ORIGINAL]: '{"titles":[]}' }));
		expect(r).toEqual({ raw: own });
	});

	it('adopts the schema-2 data of WatchLog Sync as-is while own is empty', async () => {
		for (const own of [null, undefined, {}]) {
			const r = await loadOwnOrOriginal(ownData(own), src({ [SYNC]: '{"schemaVersion":2,"settings":{"draftsTag":"#watchlog"}}' }));
			expect(r).toEqual({ raw: { schemaVersion: 2, settings: { draftsTag: '#watchlog' } }, dir: '.obsidian/plugins/watchlog-sync' });
		}
	});

	it('adopts the original plugin data when WatchLog Sync has none', async () => {
		const r = await loadOwnOrOriginal(ownData(null), src({ [ORIGINAL]: '{"titles":[{"id":"a"}]}' }));
		expect(r).toEqual({ raw: { titles: [{ id: 'a' }] }, dir: '.obsidian/plugins/watchlog' });
	});

	it('prefers WatchLog Sync over the original plugin', async () => {
		const r = await loadOwnOrOriginal(ownData(null), src({ [SYNC]: '{"schemaVersion":2}', [ORIGINAL]: '{"titles":[]}' }));
		expect(r).toEqual({ raw: { schemaVersion: 2 }, dir: '.obsidian/plugins/watchlog-sync' });
	});

	it('falls through an empty or broken WatchLog Sync to the original plugin', async () => {
		for (const sync of ['{}', '{broken']) {
			const r = await loadOwnOrOriginal(ownData(null), src({ [SYNC]: sync, [ORIGINAL]: '{"titles":[]}' }));
			expect(r).toEqual({ raw: { titles: [] }, dir: '.obsidian/plugins/watchlog' });
		}
	});

	it('returns own data when every legacy plugin is missing, empty or broken', async () => {
		expect(await loadOwnOrOriginal(ownData(null), src({}))).toEqual({ raw: null });
		expect(await loadOwnOrOriginal(ownData(null), src({ [SYNC]: '{}', [ORIGINAL]: '{}' }))).toEqual({ raw: null });
		expect(await loadOwnOrOriginal(ownData(null), src({ [SYNC]: '{broken', [ORIGINAL]: '{broken' }))).toEqual({ raw: null });
	});
});
