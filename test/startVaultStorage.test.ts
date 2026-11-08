import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from './__mocks__/obsidian';
import HoardPlugin from '../src/main';
import type { VaultLayout } from '../src/storage/VaultLayout';

interface Harness {
	plugin: HoardPlugin;
	calls: string[];
	deferred: { create: () => Promise<void>; appeared: () => unknown } | null;
	localWrite: (() => void) | null;
	adopt: ReturnType<typeof vi.fn>;
	layoutRoot: () => string;
}

interface Opts {
	bases?: Record<string, string>;
	pending?: unknown;
	filter?: 'ok' | 'missing';
	failAt?: 'migrate' | 'index';
}

function harness(o: Opts = {}): Harness {
	const calls: string[] = [];
	const track = <T>(name: string, result?: T) => () => { calls.push(name); return Promise.resolve(result as T); };
	const h: Harness = { calls, deferred: null, localWrite: null, adopt: vi.fn(), layoutRoot: () => '', plugin: null as never };
	const files = Object.entries(o.bases ?? {}).map(([path]) => ({ path, extension: 'base' }));
	const plugin = Object.create(HoardPlugin.prototype) as Record<string, unknown>;
	Object.assign(plugin, {
		settings: { types: [{ name: 'Movie' }] },
		pendingSchema1: o.pending ?? null,
		app: { vault: { getFiles: () => files, cachedRead: (f: { path: string }) => Promise.resolve(o.bases?.[f.path] ?? '') } },
		migrateWatchLog: o.failAt === 'migrate' ? () => Promise.reject(new Error('boom')) : track('migrate'),
		applySharedSettings: track('applySettings'),
		adoptSyncedBase: h.adopt,
		shared: {
			deferBase: (d: Harness['deferred']) => { calls.push('deferBase'); h.deferred = d; },
			load: track('shared.load'),
			onChange: () => calls.push('shared.onChange'),
			ensureFilter: () => { calls.push('ensureFilter'); return Promise.resolve(o.filter ?? 'ok'); },
			baseFile: () => ({ name: 'My.base' }),
			start: () => calls.push('shared.start'),
			createBase: track('createBase'),
			ensureBase: track('ensureBase'),
		},
		index: {
			onLocalWrite: (cb: () => void) => { h.localWrite = cb; },
			build: o.failAt === 'index' ? () => Promise.reject(new Error('idx')) : track('index.build'),
			sweepCache: () => calls.push('sweepCache'),
			start: () => calls.push('index.start'),
		},
		historyManager: { start: track('history.start') },
		dataManager: { init: track('dm.init'), ensureFolders: track('ensureFolders'), ensureFolder: track('ensureFolder') },
		readingDataManager: { init: track('rdm.init') },
		gameDataManager: { init: track('gdm.init') },
	});
	h.plugin = plugin as unknown as HoardPlugin;
	h.layoutRoot = () => (plugin.layout as VaultLayout).root;
	return h;
}

const start = (h: Harness): Promise<void> => (h.plugin as unknown as { startVaultStorage(): Promise<void> }).startVaultStorage();

afterEach(() => {
	Notice.shown.length = 0;
	vi.restoreAllMocks();
});

describe('startVaultStorage', () => {
	it('adopts the root of an existing base and boots every manager in order', async () => {
		const h = harness({ bases: { 'Lib/Hoard.base': 'hoard:\n  x: 1\n' } });
		await start(h);
		expect(h.layoutRoot()).toBe('Lib');
		expect(h.deferred).toBeNull();
		expect(h.calls).toEqual([
			'migrate', 'shared.load', 'applySettings', 'shared.onChange', 'ensureFilter', 'shared.start',
			'index.build', 'sweepCache', 'index.start', 'history.start', 'dm.init', 'rdm.init', 'gdm.init', 'ensureFolders',
		]);
		expect((h.plugin as unknown as { indexReady: boolean }).indexReady).toBe(true);
		expect(Notice.shown).toEqual([]);
	});

	it('warns when the base lost its filter', async () => {
		const h = harness({ bases: { 'Lib/Hoard.base': 'hoard: {}\n' }, filter: 'missing' });
		await start(h);
		expect(Notice.shown).toHaveLength(1);
		expect(Notice.shown[0]).toContain('My.base');
	});

	it('defers the base on a fresh install and creates it on the first write', async () => {
		const h = harness();
		await start(h);
		expect(h.layoutRoot()).toBe('Hoard');
		expect(h.calls).toContain('deferBase');
		expect(h.calls).not.toContain('ensureFilter');
		await h.deferred!.create();
		expect(h.calls.slice(-2)).toEqual(['ensureFolder', 'createBase']);
		void h.deferred!.appeared();
		expect(h.adopt).toHaveBeenCalledTimes(1);
		h.localWrite!();
		await Promise.resolve();
		expect(h.calls).toContain('ensureBase');
	});

	it('uses the WatchLog root while its schema-1 data awaits conversion', async () => {
		const h = harness({ pending: { settings: { rootFolder: 'Legacy' } } });
		await start(h);
		expect(h.layoutRoot()).toBe('Legacy');
		expect(h.deferred).toBeNull();
	});

	it('reports a failed start without throwing', async () => {
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		for (const failAt of ['migrate', 'index'] as const) {
			Notice.shown.length = 0;
			await start(harness({ bases: { 'a/Hoard.base': 'hoard: {}\n' }, failAt }));
			expect(Notice.shown).toHaveLength(1);
		}
		expect(err).toHaveBeenCalledTimes(2);
	});
});
