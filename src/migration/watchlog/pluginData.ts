import { findWatchLogPluginData, isEmptyData, type PluginDataSource } from './detect';

/** Where an adopted data.json came from. */
export interface WatchLogSource {
	id: string;
	dir: string;
}

export interface LoadedData {
	raw: unknown;
	/** Set when Hoard's own data.json was empty and a WatchLog one was taken instead. */
	source?: WatchLogSource;
}

/**
 * Hoard's own data.json or, while it is still empty, the one of WatchLog Sync (schema 2, taken
 * as-is) or WatchLog (schema 1, converted into notes later). Keeps entries, settings and API keys.
 */
export async function loadOwnOrWatchLog(own: () => Promise<unknown>, src: PluginDataSource): Promise<LoadedData> {
	const raw = await own();
	if (!isEmptyData(raw)) return { raw };
	const found = await findWatchLogPluginData(src);
	return found ? { raw: found.raw, source: { id: found.id, dir: found.dir } } : { raw };
}
