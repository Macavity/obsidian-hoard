import type { FileManager, Vault } from 'obsidian';
import type { AirtimeEntry } from '../../../airtime/exports';
import type { DraftPersistState } from '../../../drafts/exports';
import type { GamesData } from '../../../games/exports';
import type { ReadingData } from '../../../reading/exports';
import type { HoardPluginSettings } from '../../../settings/exports';
import type { HoardGroup, HoardTitle, MaybeTitle, SavedFilterPreset } from '../../../watchlist/exports';
import type { RecommendedDaily } from '../../../../shared/domain/rows';
import type { HistoryEntry } from '../../../../shared/domain/history';
import type { LocalStore } from '../../../../shared/storage/LocalStore';
import type { SharedConfigStore } from '../../../../shared/storage/SharedConfigStore';
import type { HistoryStore } from '../../../../shared/storage/HistoryStore';
import type { VaultLayout } from '../../../../shared/storage/VaultLayout';
import type { EntryKind, YamlIO } from '../../../../shared/storage/storageTypes';
import type { Progress } from '../../domain/importReport';

/** A title as WatchLog stored it; `manualPosterUrl` wins over `posterUrl`. */
export type WatchLogTitle = HoardTitle & { manualPosterUrl?: string };

/** WatchLog's schema-1 data.json (also the payload of its v1-v3 backups). */
export interface WatchLogData {
	titles: WatchLogTitle[];
	groups: HoardGroup[];
	settings: Partial<HoardPluginSettings>;
	airtime?: AirtimeEntry[];
	maybe?: MaybeTitle[];
	pinnedGroupId?: string | null;
	drafts?: DraftPersistState;
	savedFilterPreset?: SavedFilterPreset | null;
	posterRetryDone?: boolean;
	recommendedDaily?: RecommendedDaily;
	/** Very old installs kept these in reading.json / history.json; the flag says they were merged in. */
	reading?: ReadingData;
	history?: HistoryEntry[];
	migratedReadingHistory?: boolean;
	games?: GamesData;
	/** Entries a read could not use (`<kind> <position>`); the import reports them. */
	skipped?: string[];
}

/** WatchLog data as the import works on it: read, normalized, with reading and games always present. */
export type PreparedData = WatchLogData & { reading: ReadingData; games: GamesData; skipped: string[] };

/** Optional hooks of an import run: progress and the body source of newly created notes. */
export interface ImportHooks {
	progress?: Progress;
	/** Body of the note a source kept for this entry; null when there is none. */
	oldBody?: (kind: EntryKind, title: string, type?: string) => Promise<string | null>;
}

export interface ImportContext {
	vault: Vault;
	fileManager: FileManager;
	local: LocalStore;
	shared: SharedConfigStore;
	history: HistoryStore;
	yaml: YamlIO;
	/** Root: folder of an existing `hoard:` base, else Hoard's default root. */
	layout: VaultLayout;
}

/** WatchLog id -> new id (note path relative to root) per kind, plus group id -> name. */
export interface IdMaps {
	title: Map<string, string>;
	book: Map<string, string>;
	manga: Map<string, string>;
	game: Map<string, string>;
	group: Map<string, string>;
}

export const WISHLIST = 'Wishlist';
export { REMOVED_SETTINGS } from '../../../settings/exports';
export { isRecord } from '../../../../shared/domain/sharedHelpers';
