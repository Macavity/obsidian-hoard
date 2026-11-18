import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../shared/services/SettingsService';
import type { HistoryManager } from '../../shared/services/HistoryManager';
import type { PosterService } from '../../shared/api/PosterService';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import { confirmWith } from '../../shared/ui/ConfirmModal';
import { searchHelpWith } from '../../shared/ui/SearchHelpModal';
import { renameGroupWith } from '../../shared/ui/TabToolbar';
import { RowsCustomizeModal } from '../../shared/ui/RowsCustomizeModal';
import { AddCreditModal, type OpenAddCredit } from '../../modules/watchlist/ui/AddCreditModal';
import { AddFromUrlModal, type AddFromUrlApi, type OpenAddFromUrl } from '../../modules/watchlist/ui/AddFromUrlModal';
import { AddTitleChoiceModal, type OpenAddTitleChoice } from '../../modules/watchlist/ui/AddTitleChoiceModal';
import { AddTitleModal, type AddTitleApi, type OpenAddTitle } from '../../modules/watchlist/ui/AddTitleModal';
import { CollectionModal, type OpenCollection } from '../../modules/watchlist/ui/CollectionModal';
import type { CommunityRatingApi } from '../../modules/watchlist/ui/CommunityRating';
import { EditTitleModal, type OpenEditTitle } from '../../modules/watchlist/ui/EditTitleModal';
import { ListTab, type ListTabHost } from '../../modules/watchlist/ui/ListTab';
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
	api: AddTitleApi & AddFromUrlApi & TitleDetailApi & CommunityRatingApi & RefreshCreditsApi;
	posters: Pick<PosterService, 'enqueue' | 'clearQueue'>;
	history: Pick<HistoryManager, 'getEntries'>;
	/** Card sizing and the running import, read by the tab. */
	host: ListTabHost;
	resolveDefaultAddType: () => string;
}

/** What the rest of the app opens: the Add dialog, a title's detail and the Watchlist tab. */
export interface WatchlistUi {
	openAddTitle: OpenAddTitle;
	openTitleDetail: OpenTitleDetail;
	createListTab: (container: HTMLElement) => ListTab;
}

/** Builds the Watchlist's dialog factories and tab factory; the only place that `new`s them. */
export function watchlistUi(core: WatchlistCore): WatchlistUi {
	const { app, settings, titles, api, posters, history, host } = core;
	const confirm = confirmWith(app);
	const notes = { vault: app.vault, workspace: app.workspace };

	const openEditTitle: OpenEditTitle = (opts) => new EditTitleModal(app, settings, titles, opts).open();
	const openAddCredit: OpenAddCredit = (opts) => new AddCreditModal(app, settings, titles, opts).open();
	const openCollection: OpenCollection = (opts) => new CollectionModal(app, settings, titles, api, opts).open();
	const openAddTitle: OpenAddTitle = (opts) =>
		new AddTitleModal(app, settings, titles, api, core.resolveDefaultAddType, opts).open();
	const openAddFromUrl: OpenAddFromUrl = (opts) =>
		new AddFromUrlModal(app, settings, api, openAddTitle, opts).open();
	const openAddTitleChoice: OpenAddTitleChoice = (opts) => new AddTitleChoiceModal(app, opts).open();

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
		openAddTitle,
		openTitleDetail,
		createListTab: (container) => new ListTab(container, settings, titles, api, posters, history, host, {
			openAddTitleChoice,
			openAddTitle,
			openAddFromUrl,
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
