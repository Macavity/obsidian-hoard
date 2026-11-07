import type { DataManager } from './DataManager';
import type { ReadingDataManager } from './ReadingDataManager';
import type { GameDataManager } from './GameDataManager';
import type { HistoryEntry, HistoryManager } from './HistoryManager';
import type { GamesData, MaybeTitle, ReadingData, HoardTitle } from './types';
import type { LocalStore } from './storage/LocalStore';
import { SHARED_SETTING_KEYS, type SharedConfigStore } from './storage/SharedConfigStore';
import { parseWatchLogBackup, type WatchLogBackup } from './migration/watchlog/backupImport';
import type { ImportContext } from './migration/watchlog/schema1Types';
import { withoutCredentials } from './jikanBase';

export interface BackupManagers {
	dataManager: DataManager;
	readingDataManager: ReadingDataManager;
	gameDataManager: GameDataManager;
	historyManager: HistoryManager;
	storage: {
		local: LocalStore;
		shared: SharedConfigStore;
		importContext(): ImportContext;
	};
}

/** JSON backup. `shared` is the base config, `local` the device-local settings including API keys. */
export interface BackupFile {
	version: 2;
	exportedAt: string;
	entries: {
		titles: HoardTitle[];
		maybe: MaybeTitle[];
		reading: ReadingData;
		games: GamesData;
	};
	shared: Record<string, unknown>;
	/** Device-local settings, API keys included; restored into data.json only. */
	local: Record<string, unknown>;
	history: HistoryEntry[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export function buildBackup(m: BackupManagers): BackupFile {
	return {
		version: 2,
		exportedAt: new Date().toISOString(),
		entries: {
			titles: m.dataManager.getTitles(),
			maybe: m.dataManager.getMaybeTitles(),
			reading: m.readingDataManager.exportSnapshot(),
			games: m.gameDataManager.exportSnapshot(),
		},
		shared: m.dataManager.getSharedSettings(),
		local: structuredClone(m.storage.local.data.settings),
		history: m.historyManager.exportEntries(),
	};
}

/** keys a JSON file must never plant on a plain object */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SECRET_KEY = /api.?key|secret|client.?id|steam.?id|token/i;

/** The same backup without API keys, ids and logins: for a copy that is written into the (synced) vault. */
export function withoutSecrets(b: BackupFile): BackupFile {
	const local: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(b.local)) if (!SECRET_KEY.test(k)) local[k] = v;
	if (typeof local['jikanBaseUrl'] === 'string') {
		const endpoint = withoutCredentials(local['jikanBaseUrl']);
		if (endpoint === null) delete local['jikanBaseUrl'];
		else local['jikanBaseUrl'] = endpoint;
	}
	return { ...b, local };
}

/** Validates the whole file before anything is written; a WatchLog export is handed to its importer. */
export function parseBackup(text: string): { backup: BackupFile } | WatchLogBackup | { error: string } {
	let parsed: unknown;
	try { parsed = JSON.parse(text); } catch { return { error: 'could not parse JSON.' }; }
	if (!isRecord(parsed)) return { error: 'not an object.' };
	if (parsed['version'] !== 2 || !isRecord(parsed['entries'])) return parseWatchLogBackup(parsed);
	const e = parsed['entries'];
	const reading = e['reading'];
	const games = e['games'];
	if (!Array.isArray(e['titles']) || !Array.isArray(e['maybe'])) return { error: 'titles are missing.' };
	if (!isRecord(reading) || !Array.isArray(reading['books']) || !Array.isArray(reading['manga'])) {
		return { error: 'reading data is missing books or manga.' };
	}
	if (!isRecord(games) || !Array.isArray(games['games']) || !isRecord(games['settings'])) {
		return { error: 'games data is missing games or settings.' };
	}
	if (!isRecord(parsed['shared'])) return { error: 'shared settings are missing.' };
	if (!Array.isArray(parsed['history'])) return { error: 'activity log is not a list.' };
	if (parsed['local'] !== undefined && !isRecord(parsed['local'])) return { error: 'local settings are invalid.' };
	return { backup: { ...parsed, local: parsed['local'] ?? {} } as unknown as BackupFile };
}

/** Writes the backup through the manager APIs; notes that already exist are kept. */
export async function restoreBackup(m: BackupManagers, b: BackupFile): Promise<void> {
	const dm = m.dataManager;
	await dm.restoreSharedSettings(b.shared);
	// secrets go to data.json only, never through the base; shared keys in `local` are ignored
	const { local } = m.storage;
	for (const [k, v] of Object.entries(b.local)) {
		if (SHARED_SETTING_KEYS.includes(k) || UNSAFE_KEYS.has(k)) continue;
		local.data.settings[k] = v;
	}
	local.queueSave();
	for (const t of b.entries.titles) {
		if (!dm.getTitle(t.id)) await dm.addTitleSilent({ ...t });
	}
	for (const mb of b.entries.maybe) {
		if (!dm.getMaybeTitles().some((x) => x.id === mb.id)) await dm.addMaybeTitle({ ...mb });
	}
	dm.notifyChange();
	await m.readingDataManager.restore(b.entries.reading);
	await m.gameDataManager.restore(b.entries.games);
	await m.historyManager.restore(b.history);
}
