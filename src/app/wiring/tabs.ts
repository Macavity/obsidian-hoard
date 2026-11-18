import type { TabFactory } from '../HoardView';
import type { WatchlistUi } from './watchlist';
import type { ReadingUi } from './reading';
import type { GamesUi } from './games';
import type { AirtimeUi } from './airtime';
import type { CustomListsUi } from './customLists';
import type { DraftsUi } from './drafts';
import type { LogUi } from './log';
import type { DashboardUi } from './dashboard';

/** The per-module UI wirings the view's tabs are built from. */
export interface TabsCore {
	dashboard: DashboardUi;
	watchlist: WatchlistUi;
	airtime: AirtimeUi;
	reading: ReadingUi;
	games: GamesUi;
	customLists: CustomListsUi;
	drafts: DraftsUi;
	log: LogUi;
}

/** The view's tabs in tab-bar order, with the Upcoming and Drafts count badges. */
export function hoardTabs(ui: TabsCore): TabFactory[] {
	return [
		{
			name: 'dashboard',
			label: 'app.tabs.dashboard',
			icon: 'layout-dashboard',
			cls: 'hoard-dashboard',
			create: (container) => ui.dashboard.createDashboardTab(container),
		},
		{
			name: 'watchlist',
			label: 'app.tabs.watchlist',
			icon: 'tv',
			cls: 'hoard-list',
			create: (container) => ui.watchlist.createListTab(container),
		},
		{
			name: 'upcoming',
			label: 'app.tabs.upcoming',
			icon: 'calendar',
			cls: 'hoard-airtime',
			create: (container, setBadge) => ui.airtime.createAirtimeTab(container, setBadge),
			badge: { count: () => ui.airtime.countDue(), refreshOn: 'data-change' },
		},
		{
			name: 'reading',
			label: 'app.tabs.reading',
			icon: 'book-open',
			cls: 'hoard-reading',
			create: (container) => ui.reading.createReadingTab(container),
		},
		{
			name: 'games',
			label: 'app.tabs.games',
			icon: 'gamepad-2',
			cls: 'hoard-games',
			create: (container) => ui.games.createGamesTab(container),
		},
		{
			name: 'custom-lists',
			label: 'app.tabs.customLists',
			icon: 'list',
			cls: 'hoard-custom-lists',
			create: (container) => ui.customLists.createCustomListsTab(container),
		},
		{
			name: 'drafts',
			label: 'app.tabs.drafts',
			icon: 'square-pen',
			create: (container, setBadge) => ui.drafts.createDraftsTab(container, setBadge),
			badge: { count: () => ui.drafts.countPending(), refreshOn: 'metadata-resolved' },
		},
		{
			name: 'log',
			label: 'app.tabs.log',
			icon: 'history',
			cls: 'hoard-log',
			create: (container) => ui.log.createLogTab(container),
		},
	];
}
