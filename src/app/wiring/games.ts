import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../modules/settings/services/roles';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import type { resolveGameCover } from '../../shared/services/coverRefresh';
import { confirmWith } from '../../design-system/ConfirmModal';
import { searchHelpWith } from '../../design-system/SearchHelpModal';
import { renameGroupWith } from '../../design-system/TabToolbar';
import { RowsCustomizeModal } from '../../design-system/RowsCustomizeModal';
import type { AddProvider, OpenAddWizard } from '../../modules/add/exports';
import type { AddGameApi } from '../../modules/games/ui/GameAddForm';
import { createGamesAddProvider } from '../../modules/games/ui/gamesAddProvider';
import {
	GameDetailModal,
	GameGroupDetailModal,
	type GameDetailApi,
	type OpenGameDetail,
	type OpenGameGroupDetail,
} from '../../modules/games/ui/GameDetailModal';
import { GamesTab, type GamesTabApi, type GamesTabHost } from '../../modules/games/ui/GamesTab';

/** The core objects the Games dialogs and tab are built from. */
export interface GamesCore {
	app: App;
	settings: SettingsReader & SettingsWriter;
	games: GameDataManager;
	api: AddGameApi & GameDetailApi & GamesTabApi;
	resolveGameCover: typeof resolveGameCover;
	host: GamesTabHost;
	/** Opens the central add wizard; the tab's add button calls it. */
	openAddWizard: OpenAddWizard;
}

/** What the rest of the app opens: the Games add provider and the Games tab. */
export interface GamesUi {
	addProvider: AddProvider;
	createGamesTab: (container: HTMLElement) => GamesTab;
}

/** Builds the Games dialog factories and tab factory; the only place that `new`s them. */
export function gamesUi(core: GamesCore): GamesUi {
	const { app, settings, games, api, host, openAddWizard } = core;
	const confirm = confirmWith(app);
	const files = { vault: app.vault, workspace: app.workspace };

	const openGameDetail: OpenGameDetail = (opts) =>
		new GameDetailModal(app, settings, games, api, files, confirm, opts).open();
	const openGroupDetail: OpenGameGroupDetail = (opts) =>
		new GameGroupDetailModal(app, settings, games, openGameDetail, opts).open();

	return {
		addProvider: createGamesAddProvider({ settings, games, api }),
		createGamesTab: (container) => new GamesTab(container, settings, games, api, core.resolveGameCover, files, host, {
			openAddWizard,
			openGameDetail,
			openGroupDetail,
			openRowsCustomize: (config) => new RowsCustomizeModal(app, settings, config).open(),
			renameGroup: renameGroupWith(app),
			searchHelp: searchHelpWith(app),
			confirm,
		}),
	};
}
