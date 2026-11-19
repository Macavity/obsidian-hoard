import type { App, Plugin } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../modules/settings/contract';
import type { ApiService } from '../../shared/api/ApiService';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import type { CoverRefresher } from '../../shared/services/coverRefresh';
import type { ImportProgress } from '../../modules/watchlist/contract';
import { confirmWith } from '../../design-system/ConfirmModal';
import {
	buildBackup,
	parseBackup,
	restoreBackup,
	withoutSecrets,
	type BackupManagers,
} from '../../modules/backup/services/backup';
import { CsvModal } from '../../modules/watchlist/ui/CsvModal';
import { ReadingCsvChoiceModal } from '../../modules/reading/ui/ReadingCsvChoiceModal';
import { ReadingCsvModal } from '../../modules/reading/ui/ReadingCsvModal';
import { SteamSyncModal } from '../../modules/games/ui/SteamSyncModal';
import type { CreateListManager, OpenDefaultColumns } from '../../modules/custom-lists/ui/CustomListsTab';
import { HoardSettingsTab, type SettingsTabHost } from '../../modules/settings/ui/SettingsTab';

/** The core objects the settings pane and the dialogs it opens are built from. */
export interface SettingsCore {
	app: App;
	settings: SettingsReader & SettingsWriter;
	titles: DataManager;
	reading: ReadingDataManager;
	games: GameDataManager;
	api: ApiService;
	layout: () => { readonly root: string };
	/** Everything backup export and restore (and the WatchLog decisions) read. */
	backupManagers: () => BackupManagers;
	coverRefresher: Pick<CoverRefresher, 'refreshAll'>;
	createListManager: CreateListManager;
	openDefaultColumns: OpenDefaultColumns;
	host: Omit<SettingsTabHost, 'ensureListsFolder'>;
}

/** What the rest of the app uses: the settings pane to register. */
export interface SettingsUi {
	createSettingsTab: (plugin: Plugin) => HoardSettingsTab;
}

/** Builds the settings pane and its dialog factories; the only place that `new`s them. */
export function settingsUi(core: SettingsCore): SettingsUi {
	const { app, settings, titles, reading, games, api, host } = core;
	const confirm = confirmWith(app);
	const setImportProgress = (progress: ImportProgress | null): void => host.setImportProgress(progress);

	return {
		createSettingsTab: (plugin) => new HoardSettingsTab(
			app,
			plugin,
			settings,
			titles,
			reading,
			games,
			api,
			app.vault,
			core.layout,
			{
				build: () => buildBackup(core.backupManagers()),
				withoutSecrets,
				parse: parseBackup,
				restore: (backup) => restoreBackup(core.backupManagers(), backup),
			},
			core.coverRefresher,
			{ ...host, ensureListsFolder: () => core.createListManager().ensureFolder() },
			{
				confirm,
				openCsv: (opts) => new CsvModal(app, settings, titles, setImportProgress, opts).open(),
				openReadingCsvChoice: (mode, onChoice) => new ReadingCsvChoiceModal(app, mode, onChoice).open(),
				openReadingCsv: (opts) => new ReadingCsvModal(app, reading, opts).open(),
				openSteamSync: () => new SteamSyncModal(app, settings, games, api).open(),
				openDefaultColumns: core.openDefaultColumns,
			},
		),
	};
}
