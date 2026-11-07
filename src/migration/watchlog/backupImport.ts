import { importWatchLogData } from './schema1';
import { isRecord, type ImportContext, type WatchLogData } from './schema1Types';

/** A WatchLog backup (v1-v3) mapped to its data.json shape; restored through `restoreWatchLogBackup`. */
export interface WatchLogBackup {
	watchLog: WatchLogData;
}

/** What a restore needs from the plugin. */
export interface WatchLogRestoreTarget {
	dataManager: { notifyChange(): void };
	storage: { importContext(): ImportContext };
}

const isWatch = (v: unknown): v is Record<string, unknown> =>
	isRecord(v) && Array.isArray(v['titles']) && Array.isArray(v['groups']) && isRecord(v['settings']);

/** WatchLog exports: v1 is the bare data.json, v2/v3 wrap `watch`, `reading`, `games` and `history`. */
export function parseWatchLogBackup(p: Record<string, unknown>): WatchLogBackup | { error: string } {
	const version = p['version'];
	if (version !== 2 && version !== 3) {
		if (version !== undefined || !isWatch(p)) return { error: 'unsupported format.' };
		return { watchLog: p as unknown as WatchLogData };
	}
	const watch = p['watch'];
	if (!isWatch(watch)) return { error: 'watch data is missing titles, groups or settings.' };
	const reading = p['reading'];
	if (!isRecord(reading) || !Array.isArray(reading['books']) || !Array.isArray(reading['manga']) || !isRecord(reading['settings'])) {
		return { error: 'reading data is missing books or manga.' };
	}
	// v2 files exported before Games shipped carry them (if at all) inside `watch`
	const games = version === 3 ? p['games'] : watch['games'];
	if (version === 3 && (!isRecord(games) || !Array.isArray(games['games']) || !isRecord(games['settings']))) {
		return { error: 'games data is missing games or settings.' };
	}
	if (!Array.isArray(p['history'])) return { error: 'activity log is not a list.' };
	return { watchLog: { ...watch, reading, games, history: p['history'] } as unknown as WatchLogData };
}

/** Imports a WatchLog backup: missing notes are created, existing values are kept. Returns the errors. */
export async function restoreWatchLogBackup(m: WatchLogRestoreTarget, data: WatchLogData): Promise<string[]> {
	const report = await importWatchLogData(data, m.storage.importContext());
	m.dataManager.notifyChange();
	return report.errors;
}
