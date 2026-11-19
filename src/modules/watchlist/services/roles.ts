import type { LookupResult } from '../../../shared/api/lookup';
import type { LookupKind } from '../../../shared/storage/storageTypes';
import type { HoardTitle, HoardGroup, MaybeTitle } from '../domain/model';

/** Read access to the watchlist and the maybe list. */
export interface TitleReader {
	getTitle(id: string): HoardTitle | undefined;
	getTitles(): HoardTitle[];
	getMaybeTitles(): MaybeTitle[];
}

/** Derived numbers and groups, for overviews and widgets. */
export interface TitleStats {
	getProgress(title: HoardTitle): number;
	getNextUnwatchedEpisode(title: HoardTitle): number | null;
	getEffectiveTotal(title: HoardTitle): number;
	getTotalTimeWatched(): number;
	getTotalTimeRemaining(): number;
	getCompletedCount(): number;
	calcTimeWatched(title: HoardTitle): number;
	calcTimeRemainingForModal(title: HoardTitle): number;
	getRecentlyWatched(count: number): HoardTitle[];
	getRecentlyAdded(count: number): HoardTitle[];
	getPinnedGroupId(): string | null;
	getGroups(): HoardGroup[];
}

/** Changes to titles and the maybe list. */
export interface TitleWriter {
	updateTitle(updated: HoardTitle): Promise<void>;
	removeTitle(id: string): Promise<void>;
	markEpisodeWatched(id: string, episodeNumber: number, watched: boolean): Promise<void>;
	addMaybeTitle(title: MaybeTitle): Promise<void>;
	removeMaybeTitle(id: string): Promise<void>;
	generateMaybeId(titleName: string): string;
}

/** Bulk note maintenance, run from the settings. */
export interface TitleMaintenance {
	rewriteFrontmatterIfExists(title: HoardTitle): Promise<boolean>;
	createMarkdownFileIfMissing(title: HoardTitle): Promise<boolean>;
	ensureFolders(): Promise<void>;
	updateStudio(titleId: string, studio: string[], tmdbId?: number, tmdbMediaType?: 'movie' | 'tv'): Promise<void>;
	lookupDue(id: string, kind: LookupKind): boolean;
	recordLookup(id: string, kind: LookupKind, result: LookupResult<unknown>): void;
	notifyChange(): void;
}

/** What a backup reads from and restores into the watchlist. */
export interface TitleBackup {
	getSharedSettings(): Record<string, unknown>;
	restoreSharedSettings(settings: Record<string, unknown>): Promise<void>;
	addTitleSilent(title: HoardTitle): Promise<void>;
	addMaybeTitle(title: MaybeTitle): Promise<void>;
	notifyChange(): void;
}
