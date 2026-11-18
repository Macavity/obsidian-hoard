import type { DataManager } from '../../watchlist/services/DataManager';
import type { ReadingDataManager } from '../../reading/services/ReadingDataManager';
import type { GameDataManager } from '../../games/services/GameDataManager';
import type { HistoryManager } from '../../../shared/services/HistoryManager';
import type { HistoryEntry } from '../../../shared/domain/types';
import { DEFAULT_SETTINGS, defaultGamesSettings } from '../../../shared/domain/types';
import type { GamesData, MaybeTitle, ReadingData, HoardTitle } from '../../../shared/domain/types';
import type { LocalStore } from '../../../shared/storage/LocalStore';
import { SHARED_SETTING_KEYS, type SharedConfigStore } from '../../../shared/storage/SharedConfigStore';
import type { ImportContext } from '../../import/services/watchlog/schema1Types';
import { withoutCredentials } from '../../../shared/api/jikanBase';
import { SECRET_KEYS } from '../../../shared/storage/SecretStore';
import { isRecord, toRecord } from '../../../shared/domain/sharedHelpers';
import { at, readList, readRecord, readString } from '../../../shared/domain/read';
import { normalizeSettings } from '../../../shared/domain/settingsNormalize';
import { readColumns, readGamesSettings, readReadingSettings } from '../../../shared/domain/featureSettings';
import { readBook, readGame, readGameGroup, readManga, readMaybe, readTitle } from './backupEntries';

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

/** JSON backup. `shared` is the base config, `local` the device-local settings without secrets (API keys live in Obsidian's secret storage). */
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
	/** Device-local settings without secrets; keys of an old backup only fill empty secret storage on restore. */
	local: Record<string, unknown>;
	history: HistoryEntry[];
}

/** A key restored or imported but not yet moved into secret storage must not reach the file either. */
function withoutSecretSettings(settings: Record<string, unknown>): Record<string, unknown> {
	const out = structuredClone(settings);
	for (const k of SECRET_KEYS) delete out[k];
	return out;
}

/** Snapshot of all data; `local` holds device-local settings without secrets (they live in secret storage). */
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
		local: withoutSecretSettings(m.storage.local.data.settings),
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

/** Why a backup file was rejected; the settings tab renders it (`settings.backup.restore.errors.<code>`). */
export type BackupErrorCode =
	| 'parseJson' | 'notObject' | 'titlesMissing' | 'readingMissing' | 'gamesMissing' | 'sharedMissing'
	| 'historyInvalid' | 'localInvalid' | 'unsupportedFormat';

function readHistoryEntry(v: unknown): HistoryEntry | undefined {
	const id = at(v, 'id');
	const timestamp = at(v, 'timestamp');
	const message = at(v, 'message');
	if (typeof id !== 'string' || typeof timestamp !== 'string' || typeof message !== 'string') return undefined;
	return { ...readRecord(v), id, timestamp, message };
}

/** Validates the whole file before anything is written. */
export function parseBackup(text: string): { backup: BackupFile } | { error: BackupErrorCode } {
	let parsed: unknown;
	try { parsed = JSON.parse(text); } catch { return { error: 'parseJson' }; }
	if (!isRecord(parsed)) return { error: 'notObject' };
	if (parsed['version'] !== 2 || !isRecord(parsed['entries'])) return { error: 'unsupportedFormat' };
	const e = parsed['entries'];
	const reading = e['reading'];
	const games = e['games'];
	if (!Array.isArray(e['titles']) || !Array.isArray(e['maybe'])) return { error: 'titlesMissing' };
	if (!isRecord(reading) || !Array.isArray(reading['books']) || !Array.isArray(reading['manga'])) {
		return { error: 'readingMissing' };
	}
	if (!isRecord(games) || !Array.isArray(games['games']) || !isRecord(games['settings'])) {
		return { error: 'gamesMissing' };
	}
	if (!isRecord(parsed['shared'])) return { error: 'sharedMissing' };
	if (!Array.isArray(parsed['history'])) return { error: 'historyInvalid' };
	if (parsed['local'] !== undefined && !isRecord(parsed['local'])) return { error: 'localInvalid' };
	const backup: BackupFile = {
		version: 2,
		exportedAt: readString(parsed['exportedAt']),
		entries: {
			titles: readList(e['titles'], readTitle),
			maybe: readList(e['maybe'], readMaybe),
			reading: {
				books: readList(reading['books'], readBook),
				manga: readList(reading['manga'], readManga),
				bookColumns: readColumns(reading['bookColumns']),
				mangaColumns: readColumns(reading['mangaColumns']),
				settings: readReadingSettings(readRecord(reading['settings'])),
			},
			games: {
				games: readList(games['games'], readGame),
				groups: readList(games['groups'], readGameGroup),
				settings: readGamesSettings(readRecord(games['settings']), defaultGamesSettings()),
			},
		},
		shared: parsed['shared'],
		local: readRecord(parsed['local']),
		history: readList(parsed['history'], readHistoryEntry),
	};
	return { backup };
}

/** Writes the backup through the manager APIs; notes that already exist are kept. */
export async function restoreBackup(m: BackupManagers, b: BackupFile): Promise<void> {
	const dm = m.dataManager;
	await dm.restoreSharedSettings(b.shared);
	// keys of an old backup land via LocalStore.save in secret storage (fill-only), never in data.json; shared keys are ignored
	const { local } = m.storage;
	// a known setting of the wrong type is replaced by its valid form, the rest of the backup stays
	const checked = toRecord(normalizeSettings(b.local));
	for (const [k, v] of Object.entries(b.local)) {
		if (SHARED_SETTING_KEYS.includes(k) || UNSAFE_KEYS.has(k) || k in Object.prototype) continue;
		local.data.settings[k] = Object.hasOwn(DEFAULT_SETTINGS, k) ? checked[k] : v;
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
