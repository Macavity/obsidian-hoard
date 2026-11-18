import { describe, expect, it, vi } from 'vitest';
import HoardPlugin from '../src/app/main';
import { setupDataManager } from './helpers/setupDataManager';
import { newDataManager } from './helpers/common';
import { EntryNotes } from '../src/shared/services/EntryNotes';

describe('DataManager registrations', () => {
	it('registers the vault rename handler through the injected registerEvent', async () => {
		const registered: unknown[] = [];
		const { f, base } = await setupDataManager({});
		const spy = newDataManager(
			{ ...base, notes: new EntryNotes(f.app.vault, f.app.fileManager, base.layout, base.notify, (ref) => { registered.push(ref); }) },
			{ fetchAiring: () => Promise.resolve({ status: 'nokey' }), fetchSeasons: () => Promise.resolve({ status: 'nokey' }) },
			() => null,
			{ clearBookOrMangaReleaseDate: () => Promise.resolve(), clearGameReleaseDate: () => Promise.resolve() },
		);
		vi.spyOn(f.app.vault, 'on').mockImplementation(((name: string) => ({ name })) as never);
		await spy.init();
		expect(registered).toEqual([{ name: 'modify' }, { name: 'create' }, { name: 'rename' }]);
	});
});

describe('plugin unload', () => {
	it('unload flushes pending edits of all three managers', () => {
		const flush = { dm: vi.fn(), dmLocal: vi.fn(), dmQueued: vi.fn(), reading: vi.fn(() => Promise.resolve()), games: vi.fn(() => Promise.resolve()), settings: vi.fn(() => Promise.resolve()) };
		const plugin = Object.assign(Object.create(HoardPlugin.prototype) as HoardPlugin, <Record<string, unknown>>{
			dataManager: { flushPendingSaveSync: flush.dm, flushLocalData: flush.dmLocal, flushQueuedSaveSync: flush.dmQueued },
			readingDataManager: { flushPending: flush.reading },
			gameDataManager: { flushPending: flush.games },
			settingsService: { flush: flush.settings },
			index: { stop: vi.fn() },
			shared: { stop: vi.fn() },
			local: { flush: vi.fn() },
		});
		plugin.onunload();
		for (const fn of Object.values(flush)) expect(fn).toHaveBeenCalledTimes(1);
	});
});
