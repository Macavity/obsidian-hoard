import { MarkdownRenderer, type App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../../modules/settings/services/roles';
import type { DataManager } from '../../modules/watchlist/services/DataManager';
import type { ReadingDataManager } from '../../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../../modules/games/services/GameDataManager';
import type { OpenAddWizard } from '../../modules/add/exports';
import { confirmWith } from '../../design-system/ConfirmModal';
import {
	CustomListsTab,
	DefaultColumnsModal,
	EditColumnsModal,
	ExportFormatModal,
	ImportListModal,
	ListNameModal,
	NotesModal,
	type CreateListManager,
	type OpenDefaultColumns,
} from '../../modules/custom-lists/ui/CustomListsTab';

/** The core objects the Custom Lists dialogs and tab are built from. */
export interface CustomListsCore {
	app: App;
	settings: SettingsReader & SettingsWriter;
	createListManager: CreateListManager;
	titles: DataManager;
	reading: ReadingDataManager;
	games: GameDataManager;
	openAddWizard: OpenAddWizard;
}

/** What the rest of the app opens: the default-columns dialog of the settings and the Custom Lists tab. */
export interface CustomListsUi {
	openDefaultColumns: OpenDefaultColumns;
	createCustomListsTab: (container: HTMLElement) => CustomListsTab;
}

/** Builds the Custom Lists dialog factories and tab factory; the only place that `new`s them. */
export function customListsUi(core: CustomListsCore): CustomListsUi {
	const { app, settings, createListManager, titles, reading, games, openAddWizard } = core;
	const confirm = confirmWith(app);
	// the dialogs only generate ids, which touches no vault state, so a manager without a conflict hook does
	const idSource = createListManager();

	return {
		openDefaultColumns: () => new DefaultColumnsModal(app, settings, idSource, confirm).open(),
		createCustomListsTab: (container) => new CustomListsTab(container, settings, createListManager, app.vault, titles, reading, games, {
			openListName: (opts) => new ListNameModal(app, opts).open(),
			openEditColumns: (opts) => new EditColumnsModal(app, idSource, confirm, opts).open(),
			openNotes: (opts) => new NotesModal(
				app,
				(source, el, component) => MarkdownRenderer.render(app, source, el, '', component),
				opts,
			).open(),
			openExportFormat: (opts) => new ExportFormatModal(app, opts).open(),
			openImportList: (opts) => new ImportListModal(app, idSource, opts).open(),
			openAddWizard,
			confirm,
		}),
	};
}
