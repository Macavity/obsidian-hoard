// Shared by the setup* helpers: browser globals, tick, and the store wiring used by every manager.
import { parse, stringify } from 'yaml';
import { createFakeApp } from '../fakes/fakeApp';
import { VaultLayout } from '../../src/storage/VaultLayout';
import { LocalStore } from '../../src/storage/LocalStore';
import { SecretStore } from '../../src/storage/SecretStore';
import { SharedConfigStore } from '../../src/storage/SharedConfigStore';
import { EntryIndex } from '../../src/storage/EntryIndex';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { ManagerNotice } from '../../src/storage/storageTypes';
import type HoardPlugin from '../../src/main';

// browser globals the managers touch
const g = globalThis as Record<string, unknown>;
g.window ??= globalThis;
g.activeDocument ??= { dispatchEvent: () => true };

export const tick = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));
/** Polls until `done` holds; fails after `timeoutMs` so a slow CI runner does not turn into a flaky assertion. */
export async function until(done: () => boolean, timeoutMs = 3000): Promise<void> {
	const start = Date.now();
	while (!done()) {
		if (Date.now() - start > timeoutMs) throw new Error(`until: condition not met within ${timeoutMs}ms`);
		await tick(20);
	}
}

export interface StoreOptions {
	/** Watch types by name; defaults to Movie only. */
	types?: string[];
	/** Extra plugin members (posterService, dataManager stub, ...). */
	pluginExtra?: Record<string, unknown>;
	/** Load Hoard.base into the shared store before the index is built. */
	loadShared?: boolean;
	/** Create Hoard.base first when missing (implies loadShared). */
	createBase?: boolean;
	/** Secret storage content by secret id; when given, the LocalStore absorbs API keys into it. */
	secrets?: Record<string, string>;
}

/** FakeApp + stores wired like main.ts (root 'W'); managers are built by the caller. */
export async function createStores(files: Record<string, string>, opts: StoreOptions = {}) {
	const { types = ['Movie'], pluginExtra = {}, createBase = false } = opts;
	const f = createFakeApp(files);
	const settings = { ...DEFAULT_SETTINGS, types: types.map((name) => ({ name, color: '#000' })) };
	const plugin = {
		app: f.app,
		settings,
		manifest: f.plugin.manifest,
		registerEvent: f.plugin.registerEvent,
		...pluginExtra,
	} as unknown as HoardPlugin;
	const notices: ManagerNotice[] = [];
	const notify = (n: ManagerNotice) => { notices.push(n); };
	for (const [id, v] of Object.entries(opts.secrets ?? {})) f.secrets.set(id, v);
	const local = new LocalStore(f.plugin, opts.secrets ? new SecretStore(f.app.secretStorage) : undefined);
	await local.load();
	const layout = new VaultLayout('W', () => settings.types.map((t) => t.name));
	const shared = new SharedConfigStore(f.app, () => layout, { parse, stringify }, undefined, notify);
	if (createBase && !f.files.has('W/Hoard.base')) await shared.createBase({});
	if (createBase || opts.loadShared) await shared.load();
	const index = new EntryIndex(f.app, () => layout, local, f.plugin.registerEvent);
	await index.build();
	index.start();
	return { f, plugin, settings, local, layout, shared, index, notices, stores: { index, local, shared, layout: () => layout, notify } };
}
