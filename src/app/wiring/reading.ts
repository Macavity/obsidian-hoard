import type { App } from 'obsidian';
import type { SettingsReader } from '../../modules/settings/services/roles';
import type { HistoryManager } from '../../shared/services/HistoryManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { searchBooks } from '../../shared/services/coverRefresh';
import { confirmWith } from '../../design-system/ConfirmModal';
import { searchHelpWith } from '../../design-system/SearchHelpModal';
import { RowsCustomizeModal } from '../../design-system/RowsCustomizeModal';
import type { AddProvider, OpenAddWizard } from '../../modules/add/exports';
import type { AddReadingApi } from '../../modules/reading/ui/ReadingAddForm';
import { createReadingAddProvider } from '../../modules/reading/ui/readingAddProvider';
import { VaultFilePicker } from '../../modules/reading/ui/VaultFilePicker';
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
	/** Opens the central add wizard; the tab's add button calls it. */
	openAddWizard: OpenAddWizard;
}

/** What the rest of the app opens: the Reading add provider and the Reading tab. */
export interface ReadingUi {
	addProvider: AddProvider;
	createReadingTab: (container: HTMLElement) => ReadingTab;
}

/** Builds the Reading dialog factories and tab factory; the only place that `new`s them. */
export function readingUi(core: ReadingCore): ReadingUi {
	const { app, settings, reading, api, history, host, covers, openAddWizard } = core;
	const confirm = confirmWith(app);
	const files = { vault: app.vault, workspace: app.workspace };

	const openManageColumns: OpenManageColumns = (opts) =>
		new ReadingManageColumnsModal(app, settings, reading, confirm, opts).open();
	const openDetail: OpenReadingDetail = (opts) =>
		new ReadingDetailModal(app, settings, reading, api, history, files, {
			openManageColumns,
			pickVaultFile: (onPick) => new VaultFilePicker(app, app.vault.getMarkdownFiles(), onPick).open(),
			confirm,
		}, opts).open();

	return {
		addProvider: createReadingAddProvider({ settings, reading, api, searchBooks: core.searchBooks }),
		createReadingTab: (container) => new ReadingTab(container, settings, reading, api, covers, host, {
			openAddWizard,
			openManageColumns,
			openDetail,
			openRowsCustomize: (config) => new RowsCustomizeModal(app, settings, config).open(),
			searchHelp: searchHelpWith(app),
			confirm,
		}),
	};
}
