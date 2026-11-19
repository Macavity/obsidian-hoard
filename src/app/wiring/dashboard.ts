import type { SettingsReader } from '../../modules/settings/contract';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import { DashboardTab, type DashboardTitles } from '../../modules/dashboard/ui/DashboardTab';

/** The core objects the Dashboard tab is built from. */
export interface DashboardCore {
	settings: SettingsReader;
	titles: DashboardTitles;
	reading: Pick<ReadingDataManager, 'getBooks' | 'getMangaList'>;
	games: Pick<GameDataManager, 'getGames'>;
}

/** What the rest of the app opens: the Dashboard tab. */
export interface DashboardUi {
	createDashboardTab: (container: HTMLElement) => DashboardTab;
}

/** Builds the Dashboard tab factory; the only place that `new`s the tab. */
export function dashboardUi(core: DashboardCore): DashboardUi {
	const { settings, titles, reading, games } = core;
	return { createDashboardTab: (container) => new DashboardTab(container, settings, titles, reading, games) };
}
