import { normalizePath, type App, type TFile } from 'obsidian';
import { hasTopLevelKey } from '../../storage/baseFile';

/** Top-level key of the settings block WatchLog Sync wrote into its base. */
export const WATCHLOG_KEY = 'watchlog';
/** Base file name of WatchLog Sync. */
const WATCHLOG_BASE_FILE = 'WatchLog.base';
/** Plugin ids whose data.json is adopted: WatchLog Sync (schema 2) first, then WatchLog (schema 1). */
export const WATCHLOG_PLUGIN_IDS = ['watchlog-sync', 'watchlog'] as const;

/** Read access to the plugin folders below the config dir. */
export interface PluginDataSource {
	configDir: string;
	adapter: { exists(path: string): Promise<boolean>; read(path: string): Promise<string> };
}

/** A WatchLog data.json found in the vault. */
export interface WatchLogPluginData {
	raw: unknown;
	/** Plugin id it was read from. */
	id: string;
	/** Its plugin folder; the schema-1 backup is written next to it. */
	dir: string;
}

export const isEmptyData = (raw: unknown): boolean =>
	raw === null || raw === undefined || (typeof raw === 'object' && Object.keys(raw).length === 0);

/**
 * First `.base` (path-sorted, the rule of `VaultLayout.findRoot`) named `WatchLog.base` or holding a
 * top-level `watchlog:` block; null when the vault has none.
 */
export async function findWatchLogBase(app: App): Promise<TFile | null> {
	const bases = app.vault.getFiles().filter((f) => f.extension === 'base');
	bases.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const f of bases) {
		if (f.name === WATCHLOG_BASE_FILE) return f;
		if (hasTopLevelKey(await app.vault.cachedRead(f), WATCHLOG_KEY)) return f;
	}
	return null;
}

async function readPluginData(src: PluginDataSource, id: string): Promise<WatchLogPluginData | null> {
	const dir = normalizePath(`${src.configDir}/plugins/${id}`);
	const path = normalizePath(`${dir}/data.json`);
	try {
		if (!(await src.adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await src.adapter.read(path));
		return isEmptyData(parsed) ? null : { raw: parsed, id, dir };
	} catch (e) {
		console.warn(`[Hoard] could not read the data.json of ${id}`, e);
		return null;
	}
}

/** The first non-empty, readable data.json of `WATCHLOG_PLUGIN_IDS`, in that order. */
export async function findWatchLogPluginData(src: PluginDataSource): Promise<WatchLogPluginData | null> {
	for (const id of WATCHLOG_PLUGIN_IDS) {
		const found = await readPluginData(src, id);
		if (found) return found;
	}
	return null;
}
