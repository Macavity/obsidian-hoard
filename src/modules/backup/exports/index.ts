import type { HoardTitle, MaybeTitle } from '../../watchlist/exports';
import type { ReadingData } from '../../reading/exports';
import type { GamesData } from '../../games/exports';
import type { HistoryEntry } from '../../../shared/domain/history';

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

/** Why a backup file was rejected; the settings tab renders it (`settings.backup.restore.errors.<code>`). */
export type BackupErrorCode =
	| 'parseJson' | 'notObject' | 'titlesMissing' | 'readingMissing' | 'gamesMissing' | 'sharedMissing'
	| 'historyInvalid' | 'localInvalid' | 'unsupportedFormat';

export type BackupParseResult = { backup: BackupFile } | { error: BackupErrorCode };
