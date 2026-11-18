import { describe, expect, it, vi } from 'vitest';
import { DataManager } from '../src/DataManager';
import HoardPlugin from '../src/main';
import { setupDataManager } from './helpers/setupDataManager';

describe('DataManager registrations', () => {
	it('registers the vault rename handler through the injected registerEvent', async () => {
		const registered: unknown[] = [];
		const { f, base } = await setupDataManager({});
		const spy = new DataManager({
			...base,
			api: { fetchAiring: () => Promise.resolve({ status: 'nokey' }), fetchSeasons: () => Promise.resolve({ status: 'nokey' }) },
			posters: () => null,
			registerEvent: (ref) => { registered.push(ref); },
			releaseDates: { clearBookOrMangaReleaseDate: () => Promise.resolve(), clearGameReleaseDate: () => Promise.resolve() },
		});
		vi.spyOn(f.app.vault, 'on').mockImplementation(((name: string) => ({ name })) as never);
		await spy.init();
		expect(registered).toEqual([{ name: 'modify' }, { name: 'create' }, { name: 'rename' }]);
	});
});

describe('plugin unload', () => {
	it('unload flushes pending edits of all three managers', () => {
		const flush = { dm: vi.fn(), dmLocal: vi.fn(), dmQueued: vi.fn(), reading: vi.fn(() => Promise.resolve()), games: vi.fn(() => Promise.resolve()) };
		const plugin = Object.assign(Object.create(HoardPlugin.prototype) as HoardPlugin, <Record<string, unknown>>{
			dataManager: { flushPendingSaveSync: flush.dm, flushLocalData: flush.dmLocal, flushQueuedSaveSync: flush.dmQueued },
			readingDataManager: { flushPending: flush.reading },
			gameDataManager: { flushPending: flush.games },
			index: { stop: vi.fn() },
			shared: { stop: vi.fn() },
			local: { flush: vi.fn() },
		});
		plugin.onunload();
		for (const fn of Object.values(flush)) expect(fn).toHaveBeenCalledTimes(1);
	});
});
