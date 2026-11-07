import type { App } from 'obsidian';
import type {
	AirtimeEntry, DraftPersistState, GamesData, HoardGroup, HoardPluginSettings, HoardTitle, MaybeTitle,
	ReadingData, RecommendedDaily, SavedFilterPreset,
} from '../../types';
import type { HistoryEntry } from '../../HistoryManager';
import type { LocalStore } from '../../storage/LocalStore';
import type { SharedConfigStore } from '../../storage/SharedConfigStore';
import type { HistoryStore } from '../../storage/HistoryStore';
import type { VaultLayout } from '../../storage/VaultLayout';
import type { YamlIO } from '../../storage/storageTypes';

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
}

export interface Schema1Report {
	notesCreated: number;
	notesFilled: number;
	foldersMoved: string[];
	skipped: string[];
	errors: string[];
}

export const emptyReport = (): Schema1Report => ({ notesCreated: 0, notesFilled: 0, foldersMoved: [], skipped: [], errors: [] });

export interface ImportContext {
	app: App;
	local: LocalStore;
	shared: SharedConfigStore;
	history: HistoryStore;
	yaml: YamlIO;
	/** Root: folder of an existing `hoard:` base, else `watchLogRoot(data)`. */
	layout: VaultLayout;
}

export interface Schema1Context extends ImportContext {
	/** Folder of the plugin whose data.json holds `data`; the backup is written there. */
	pluginDir: string | undefined;
	data: WatchLogData;
}

/** WatchLog id -> new id (note path relative to root) per kind, plus group id -> name. */
export interface IdMaps {
	title: Map<string, string>;
	book: Map<string, string>;
	manga: Map<string, string>;
	game: Map<string, string>;
	group: Map<string, string>;
}

export type Fm = Record<string, unknown>;

export const WISHLIST = 'Wishlist';
/** Settings dropped by Hoard (the folders are central). */
export const REMOVED_SETTINGS = ['rootFolder', 'customListsFolder'];

export const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
