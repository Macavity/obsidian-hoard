import type { App } from 'obsidian';
import type { SettingsReader } from '../../modules/settings/services/roles';
import type { OpenAddWizard } from '../../modules/add/exports';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import { DraftsTab } from '../../modules/drafts/ui/DraftsTab';

/** The core objects the Drafts tab and its badge count are built from. */
export interface DraftsCore {
	app: App;
	settings: SettingsReader;
	titles: DataManager;
	reading: ReadingDataManager;
	games: GameDataManager;
	openAddWizard: OpenAddWizard;
}

/** What the rest of the app uses: the Drafts tab and the count its tab button shows without the tab open. */
export interface DraftsUi {
	createDraftsTab: (container: HTMLElement, setBadge: (count: number) => void) => DraftsTab;
	countPending: () => Promise<number>;
}

/** Builds the Drafts tab factory and the pending count; the only place that `new`s the tab. */
export function draftsUi(core: DraftsCore): DraftsUi {
	const { app, settings, titles, reading, games, openAddWizard } = core;
	const notes = { vault: app.vault, metadataCache: app.metadataCache, workspace: app.workspace };

	return {
		createDraftsTab: (container, setBadge) => new DraftsTab(container, settings, titles, reading, games, notes, openAddWizard, setBadge),
		countPending: () => DraftsTab.computePendingCount(settings, titles, reading, games, notes),
	};
}
