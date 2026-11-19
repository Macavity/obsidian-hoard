import type { App } from 'obsidian';
import type { SettingsReader } from '../../modules/settings/exports';
import type { HistoryManager } from '../../shared/services/HistoryManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { searchBooks } from '../../shared/services/coverRefresh';
import { confirmWith } from '../../design-system/ConfirmModal';
import { searchHelpWith } from '../../design-system/SearchHelpModal';
import { RowsCustomizeModal } from '../../design-system/RowsCustomizeModal';
import { AddReadingModal, VaultFilePicker, type AddReadingApi, type OpenAddReading } from '../../modules/reading/ui/AddReadingModal';
import {
	ReadingDetailModal,
	type OpenReadingDetail,
	type ReadingDetailApi,
} from '../../modules/reading/ui/ReadingDetailModal';
import { ReadingManageColumnsModal, type OpenManageColumns } from '../../modules/reading/ui/ReadingManageColumnsModal';
import {
	ReadingTab,
	type ReadingCovers,
	type ReadingTabApi,
	type ReadingTabHost,
} from '../../modules/reading/ui/ReadingTab';

/** The core objects the Reading dialogs and tab are built from. */
export interface ReadingCore {
	app: App;
	settings: SettingsReader;
	reading: ReadingDataManager;
	api: AddReadingApi & ReadingDetailApi & ReadingTabApi;
	history: Pick<HistoryManager, 'log'>;
	searchBooks: typeof searchBooks;
	covers: ReadingCovers;
	host: ReadingTabHost;
}

/** What the rest of the app opens: the Add dialog and the Reading tab. */
export interface ReadingUi {
	openAddReading: OpenAddReading;
	createReadingTab: (container: HTMLElement) => ReadingTab;
}

/** Builds the Reading dialog factories and tab factory; the only place that `new`s them. */
export function readingUi(core: ReadingCore): ReadingUi {
	const { app, settings, reading, api, history, host, covers } = core;
	const confirm = confirmWith(app);
	const files = { vault: app.vault, workspace: app.workspace };

	const openAddReading: OpenAddReading = (opts) =>
		new AddReadingModal(app, settings, reading, app.vault, app.workspace, core.searchBooks, api, opts).open();
	const openManageColumns: OpenManageColumns = (opts) =>
		new ReadingManageColumnsModal(app, settings, reading, confirm, opts).open();
	const openDetail: OpenReadingDetail = (opts) =>
		new ReadingDetailModal(app, settings, reading, api, history, files, {
			openManageColumns,
			pickVaultFile: (onPick) => new VaultFilePicker(app, app.vault.getMarkdownFiles(), onPick).open(),
			confirm,
		}, opts).open();

	return {
		openAddReading,
		createReadingTab: (container) => new ReadingTab(container, settings, reading, api, covers, host, {
			openAddReading,
			openManageColumns,
			openDetail,
			openRowsCustomize: (config) => new RowsCustomizeModal(app, settings, config).open(),
			searchHelp: searchHelpWith(app),
			confirm,
		}),
	};
}
