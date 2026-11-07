import { normalizePath } from 'obsidian';

/** Plugin id of the original upstream plugin (schema 1). */
export const ORIGINAL_PLUGIN_ID = 'watchlog';
/** Plugin id of WatchLog Sync, the direct predecessor (schema 2). */
export const SYNC_PLUGIN_ID = 'watchlog-sync';
/** Predecessors whose data.json is adopted while this plugin starts empty; first non-empty wins. */
export const LEGACY_PLUGIN_IDS = [SYNC_PLUGIN_ID, ORIGINAL_PLUGIN_ID] as const;

export interface LegacyPluginSource {
	configDir: string;
	adapter: { exists(path: string): Promise<boolean>; read(path: string): Promise<string> };
}

export interface LoadedData {
	raw: unknown;
	/** Folder of the plugin the data was read from; differs from our own only on a takeover. */
	dir?: string;
}

const isEmpty = (raw: unknown): boolean =>
	raw === null || raw === undefined || (typeof raw === 'object' && Object.keys(raw).length === 0);

async function readLegacy(src: LegacyPluginSource, id: string): Promise<LoadedData | null> {
	const dir = normalizePath(`${src.configDir}/plugins/${id}`);
	const path = normalizePath(`${dir}/data.json`);
	try {
		if (!(await src.adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await src.adapter.read(path));
		return isEmpty(parsed) ? null : { raw: parsed, dir };
	} catch (e) {
		console.warn(`[Hoard] could not read the data.json of ${id}`, e);
		return null;
	}
}

/**
 * Our own data.json, or, while it is still empty, the one of a predecessor living in the same
 * vault (WatchLog Sync first, then the original plugin). Lets a switch keep entries, settings and API keys.
 */
export async function loadOwnOrOriginal(own: () => Promise<unknown>, src: LegacyPluginSource): Promise<LoadedData> {
	const raw = await own();
	if (!isEmpty(raw)) return { raw };
	for (const id of LEGACY_PLUGIN_IDS) {
		const adopted = await readLegacy(src, id);
		if (adopted) return adopted;
	}
	return { raw };
}
