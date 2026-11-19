import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../modules/settings/contract';
import type { ApiService } from '../../shared/api/ApiService';
import type { PosterService } from '../../shared/api/PosterService';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import type { TitleSearchApi } from '../../shared/services/titleSearch';
import { confirmWith } from '../../design-system/ConfirmModal';
import { AirtimeScheduleModal } from '../../modules/airtime/ui/AirtimeScheduleModal';
import { AirtimeTab, type AirtimeTabHost } from '../../modules/airtime/ui/AirtimeTab';
import { GameScheduleModal } from '../../modules/airtime/ui/GameScheduleModal';
import { MaybeAddModal } from '../../modules/airtime/ui/MaybeAddModal';
import { ReadingScheduleModal } from '../../modules/airtime/ui/ReadingScheduleModal';
import { UpcomingFinderModal } from '../../modules/airtime/ui/UpcomingFinderModal';

/** The core objects the Upcoming dialogs and tab are built from. */
export interface AirtimeCore {
	app: App;
	settings: SettingsReader & SettingsWriter;
	titles: DataManager;
	reading: ReadingDataManager;
	games: GameDataManager;
	api: TitleSearchApi & Pick<ApiService, 'getAnimeScheduleByMalId'>;
	posters: Pick<PosterService, 'clearQueue' | 'enqueue'>;
	host: AirtimeTabHost;
}

/** What the rest of the app uses: the Upcoming tab, which reports its count to the tab button, and the due count without it. */
export interface AirtimeUi {
	/** Entries aired or maybe-due now; drives the tab badge and the status bar. */
	countDue: () => number;
	createAirtimeTab: (container: HTMLElement, setBadge: (count: number) => void) => AirtimeTab;
}

/** Builds the Upcoming dialog factories and tab factory; the only place that `new`s them. */
export function airtimeUi(core: AirtimeCore): AirtimeUi {
	const { app, settings, titles, reading, games, api, posters, host } = core;

	return {
		countDue: () => AirtimeTab.getAiredDueCount(titles, reading, games) + AirtimeTab.getMaybeDueCount(titles),
		createAirtimeTab: (container, setBadge) => new AirtimeTab(
			container, settings, titles, reading, games, api, posters, host,
			{
				openMaybeAdd: (opts) => new MaybeAddModal(app, settings, api, titles, opts).open(),
				openUpcomingFinder: (opts) => new UpcomingFinderModal(app, opts).open(),
				openGameSchedule: (opts) => new GameScheduleModal(app, opts).open(),
				openReadingSchedule: (opts) => new ReadingScheduleModal(app, opts).open(),
				openAirtimeSchedule: (opts) => new AirtimeScheduleModal(app, opts).open(),
				confirm: confirmWith(app),
			},
			setBadge,
		),
	};
}
