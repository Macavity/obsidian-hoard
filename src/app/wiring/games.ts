import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../shared/services/SettingsService';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import type { resolveGameCover } from '../../modules/covers/services/coverRefresh';
import { confirmWith } from '../../shared/ui/ConfirmModal';
import { searchHelpWith } from '../../shared/ui/SearchHelpModal';
import { renameGroupWith } from '../../shared/ui/TabToolbar';
import { RowsCustomizeModal } from '../../shared/ui/RowsCustomizeModal';
import { AddGameModal, type AddGameApi, type OpenAddGame } from '../../modules/games/ui/AddGameModal';
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
}

/** What the rest of the app opens: the Add dialog and the Games tab. */
export interface GamesUi {
	openAddGame: OpenAddGame;
	createGamesTab: (container: HTMLElement) => GamesTab;
}

/** Builds the Games dialog factories and tab factory; the only place that `new`s them. */
export function gamesUi(core: GamesCore): GamesUi {
	const { app, settings, games, api, host } = core;
	const confirm = confirmWith(app);
	const files = { vault: app.vault, workspace: app.workspace };

	const openAddGame: OpenAddGame = (opts) => new AddGameModal(app, settings, games, api, opts).open();
	const openGameDetail: OpenGameDetail = (opts) =>
		new GameDetailModal(app, settings, games, api, files, confirm, opts).open();
	const openGroupDetail: OpenGameGroupDetail = (opts) =>
		new GameGroupDetailModal(app, settings, games, openGameDetail, opts).open();

	return {
		openAddGame,
		createGamesTab: (container) => new GamesTab(container, settings, games, api, core.resolveGameCover, files, host, {
			openAddGame,
			openGameDetail,
			openGroupDetail,
			openRowsCustomize: (config) => new RowsCustomizeModal(app, settings, config).open(),
			renameGroup: renameGroupWith(app),
			searchHelp: searchHelpWith(app),
			confirm,
		}),
	};
}
