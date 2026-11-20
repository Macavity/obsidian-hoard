import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../modules/settings/services/roles';
import type { HistoryManager } from '../../shared/services/HistoryManager';
import type { PosterService } from '../../shared/api/PosterService';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import { confirmWith } from '../../design-system/ConfirmModal';
import { searchHelpWith } from '../../design-system/SearchHelpModal';
import { renameGroupWith } from '../../design-system/TabToolbar';
import { RowsCustomizeModal } from '../../design-system/RowsCustomizeModal';
import { AddCreditModal, type OpenAddCredit } from '../../modules/watchlist/ui/AddCreditModal';
import { CollectionModal, type OpenCollection } from '../../modules/watchlist/ui/CollectionModal';
import type { CommunityRatingApi } from '../../modules/watchlist/ui/CommunityRating';
import { EditTitleModal, type OpenEditTitle } from '../../modules/watchlist/ui/EditTitleModal';
import type { AddProvider, OpenAddWizard } from '../../modules/add/exports';
import { ListTab, type ListTabHost } from '../../modules/watchlist/ui/ListTab';
import type { AddTitleApi } from '../../modules/watchlist/ui/TitleAddForm';
import type { TitleUrlApi } from '../../modules/watchlist/ui/titleUrl';
import { createWatchlistAddProvider } from '../../modules/watchlist/ui/watchlistAddProvider';
import {
	GroupDetailModal,
	TitleDetailModal,
	type OpenGroupDetail,
	type OpenTitleDetail,
	type RefreshCreditsApi,
	type TitleDetailApi,
} from '../../modules/watchlist/ui/TitleDetailModal';

/** The core objects the Watchlist dialogs and tab are built from. */
export interface WatchlistCore {
	app: App;
	settings: SettingsReader & SettingsWriter;
	titles: DataManager;
	api: AddTitleApi & TitleUrlApi & TitleDetailApi & CommunityRatingApi & RefreshCreditsApi;
	posters: Pick<PosterService, 'enqueue' | 'clearQueue'>;
	history: Pick<HistoryManager, 'getEntries'>;
	/** Card sizing and the running import, read by the tab. */
	host: ListTabHost;
	/** Opens the central add wizard; the tab's add button calls it. */
	openAddWizard: OpenAddWizard;
}

/** What the rest of the app opens: the Watchlist's add provider, a title's detail and the Watchlist tab. */
export interface WatchlistUi {
	addProvider: AddProvider;
	openTitleDetail: OpenTitleDetail;
	createListTab: (container: HTMLElement) => ListTab;
}

/** Builds the Watchlist's dialog factories and tab factory; the only place that `new`s them. */
export function watchlistUi(core: WatchlistCore): WatchlistUi {
	const { app, settings, titles, api, posters, history, host, openAddWizard } = core;
	const confirm = confirmWith(app);
	const notes = { vault: app.vault, workspace: app.workspace };

	const openEditTitle: OpenEditTitle = (opts) => new EditTitleModal(app, settings, titles, opts).open();
	const openAddCredit: OpenAddCredit = (opts) => new AddCreditModal(app, settings, titles, opts).open();
	const openCollection: OpenCollection = (opts) => new CollectionModal(app, settings, titles, api, opts).open();

	// a collection member opens another detail modal, so the factory refers to itself
	const openTitleDetail: OpenTitleDetail = (opts) =>
		new TitleDetailModal(app, settings, titles, api, posters, notes, {
			openAddCredit,
			openEditTitle,
			openCollection,
			openTitleDetail: (o) => openTitleDetail(o),
			confirm,
		}, opts).open();
	const openGroupDetail: OpenGroupDetail = (opts) =>
		new GroupDetailModal(app, settings, titles, posters, openTitleDetail, openEditTitle, opts).open();

	return {
		addProvider: createWatchlistAddProvider({ settings, titles, api }),
		openTitleDetail,
		createListTab: (container) => new ListTab(container, settings, titles, api, posters, history, host, {
			openAddWizard,
			openTitleDetail,
			openGroupDetail,
			openEditTitle,
			openAddCredit,
			openRowsCustomize: (config) => new RowsCustomizeModal(app, settings, config).open(),
			renameGroup: renameGroupWith(app),
			searchHelp: searchHelpWith(app),
			confirm,
		}),
	};
}
