import { afterEach, describe, expect, it, vi } from 'vitest';
import HoardPlugin from '../../../src/main';
import type { WatchLogSources } from '../../../src/import/watchlog/detect';

const hoisted = vi.hoisted(() => ({
	order: [] as string[],
	resolve: null as (() => void) | null,
	sources: null as WatchLogSources | Error | null,
}));

vi.mock('../../../src/WatchLogOnboardingModal', () => ({
	WatchLogOnboardingModal: class {
		finished: Promise<void>;
		constructor() {
			this.finished = new Promise((r) => { hoisted.resolve = () => { hoisted.order.push('wizard:finished'); r(); }; });
		}
		open(): void { hoisted.order.push('wizard:open'); }
	},
}));
vi.mock('../../../src/import/watchlog/detect', () => ({
	detectWatchLogSources: () => hoisted.sources instanceof Error ? Promise.reject(hoisted.sources) : Promise.resolve(hoisted.sources),
}));

const found = { original: null, fork: { kind: 'fork' }, hoardHasData: false } as unknown as WatchLogSources;
const none = { original: null, fork: null, hoardHasData: false } as WatchLogSources;
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function setup(sources: WatchLogSources | Error) {
	hoisted.order.length = 0;
	hoisted.resolve = null;
	hoisted.sources = sources;
	const track = (n: string) => () => { hoisted.order.push(n); return Promise.resolve(); };
	const plugin = Object.create(HoardPlugin.prototype) as Record<string, unknown>;
	Object.assign(plugin, {
		settings: { types: [] },
		local: { data: { ui: {} } },
		app: { vault: { getFiles: () => [], cachedRead: () => Promise.resolve('') } },
		applySharedSettings: track('applySettings'),
		backupManagers: () => ({ storage: { importContext: () => ({}) } }),
		shared: { deferBase: () => {}, load: track('shared.load'), onChange: () => {}, ensureFilter: () => Promise.resolve('ok'), start: () => {} },
		index: { onLocalWrite: () => {}, build: track('index:build'), sweepCache: () => {}, start: () => {} },
		historyManager: { start: track('h') },
		dataManager: { init: track('d'), ensureFolders: track('e'), ensureFolder: track('f') },
		readingDataManager: { init: track('r') },
		gameDataManager: { init: track('g') },
	});
	const calls = hoisted.order;
	const startFn = (): Promise<void> => (plugin as unknown as { startVaultStorage(): Promise<void> }).startVaultStorage();
	return { plugin: plugin as unknown as HoardPlugin, calls, start: startFn };
}

vi.stubGlobal('activeDocument', document);

afterEach(() => vi.restoreAllMocks());

describe('start order', () => {
	it('builds the index only after the wizard finished', async () => {
		const { calls, start, plugin } = setup(found);
		const started = start();
		await flush();
		expect(calls.filter((c) => c.startsWith('wizard') || c.startsWith('index'))).toEqual(['wizard:open']);
		expect(plugin.importRunning).toBe(true);
		hoisted.resolve!();
		await started;
		expect(calls.filter((c) => c.startsWith('wizard') || c.startsWith('index'))).toEqual(['wizard:open', 'wizard:finished', 'index:build']);
		expect(plugin.importRunning).toBe(false);
	});

	it('opens no wizard without pending sources', async () => {
		const { calls, start } = setup(none);
		await start();
		expect(calls.filter((c) => c.startsWith('wizard') || c.startsWith('index'))).toEqual(['index:build']);
	});

	it('a failing detection does not block the start', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { calls, start } = setup(new Error('boom'));
		await start();
		expect(calls).toContain('index:build');
		expect(err).toHaveBeenCalledTimes(1);
	});
});
