// Shared by the setup* helpers: browser globals, tick, and the store wiring used by every manager.
import { parse, stringify } from 'yaml';
import { createFakeApp } from '../fakes/fakeApp';
import { VaultLayout } from '../../src/shared/storage/VaultLayout';
import { LocalStore } from '../../src/shared/storage/LocalStore';
import { SecretStore } from '../../src/shared/storage/SecretStore';
import { SharedConfigStore } from '../../src/shared/storage/SharedConfigStore';
import { EntryIndex } from '../../src/shared/storage/EntryIndex';
import { EntryNotes } from '../../src/shared/services/EntryNotes';
import { DEFAULT_SETTINGS } from '../../src/shared/domain/settingsDefaults';
import type { ManagerNotice } from '../../src/shared/storage/storageTypes';
import { DataManager } from '../../src/modules/watchlist/services/DataManager';
import type { PosterQueue, ReleaseDateTargets } from '../../src/modules/watchlist/services/DataManager';
import { ReadingDataManager, type ReadingUpcomingSync } from '../../src/modules/reading/services/ReadingDataManager';
import { GameDataManager, type GameUpcomingSync } from '../../src/modules/games/services/GameDataManager';
import type { ApiService } from '../../src/shared/api/ApiService';
import type HoardPlugin from '../../src/app/main';

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
	const shared = new SharedConfigStore(f.app.vault, () => layout, { parse, stringify }, undefined, notify);
	if (createBase && !f.files.has('W/Hoard.base')) await shared.createBase({});
	if (createBase || opts.loadShared) await shared.load();
	const index = new EntryIndex(f.app.vault, f.app.metadataCache, f.app.workspace, () => layout, local, f.plugin.registerEvent);
	await index.build();
	index.start();
	const stores = { index, local, shared, layout: () => layout, notify };
	/** Stores plus what every manager takes besides them. */
	const notes = new EntryNotes(f.app.vault, f.app.fileManager, () => layout, notify, f.plugin.registerEvent);
	const base = { ...stores, notes, vault: f.app.vault, fileManager: f.app.fileManager, settings: { get: () => settings }, registerEvent: f.plugin.registerEvent };
	return { f, plugin, settings, local, layout, shared, index, notices, stores, base };
}

export type StoreBase = Awaited<ReturnType<typeof createStores>>['base'];

/** A DataManager on the stores of `createStores`; the ports are the caller's. */
export function newDataManager(
	base: StoreBase,
	api: Pick<ApiService, 'fetchAiring' | 'fetchSeasons'>,
	posters: () => PosterQueue | null,
	releaseDates: ReleaseDateTargets,
): DataManager {
	return new DataManager(
		base.notes, base.index, base.local, base.shared, base.notify,
		base.settings, api, posters, releaseDates,
	);
}

export function newReadingManager(base: StoreBase, upcoming: ReadingUpcomingSync): ReadingDataManager {
	return new ReadingDataManager(
		base.notes, base.index, base.local, base.shared, base.notify, base.settings, upcoming,
	);
}

export function newGameManager(base: StoreBase, upcoming: GameUpcomingSync): GameDataManager {
	return new GameDataManager(
		base.notes, base.index, base.local, base.shared, base.notify, base.settings, upcoming,
	);
}
