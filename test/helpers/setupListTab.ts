// Real DataManager on a fake vault + a ListTab mounted in happy-dom.
import type { OpenAddWizard } from '../../src/modules/add/exports';
import { vi } from 'vitest';
import { setupDataManager } from './setupDataManager';
import { ListTab, type ListTabHost, type ListTabModals } from '../../src/modules/watchlist/ui/ListTab';
import { confirmWith } from '../../src/design-system/ConfirmModal';
import { RowsCustomizeModal } from '../../src/design-system/RowsCustomizeModal';
import { fakeSettings } from './fakeSettings';
import type { HoardPluginSettings } from '../../src/modules/settings/domain/model';
import type { HoardTitle } from '../../src/modules/watchlist/domain/model';

// Obsidian's activeDocument (popout-aware document); common.ts stubs it with a bare object
(globalThis as { activeDocument?: Document }).activeDocument = document;

export const movieNote = (title: string, extra = ''): string =>
	`---\nName: ${title}\nType: Movie\nSource Type: Movie\n${extra}---\n`;

export const showNote = (title: string, extra = ''): string =>
	`---\nName: ${title}\nType: TV Show\nSource Type: Series\nSeasons: ["Season 1: 4"]\n${extra}---\n`;

export type PosterEnqueue = (title: HoardTitle) => Promise<string | null>;

export async function setupListTab(
	files: Record<string, string>,
	settings: Partial<HoardPluginSettings> = {},
	view: 'list' | 'rows' = 'list',
	enqueue: PosterEnqueue = () => Promise.resolve(null),
) {
	const env = await setupDataManager(files);
	Object.assign(env.settings, { defaultWatchlistView: view, ...settings });
	const settingsService = fakeSettings(env.settings);
	const posters = { enqueue: vi.fn(enqueue), clearQueue: vi.fn() };
	const modals = {
		openAddWizard: vi.fn<OpenAddWizard>(),
		openTitleDetail: vi.fn(),
		openGroupDetail: vi.fn(),
		openEditTitle: vi.fn(),
		openAddCredit: vi.fn(),
		// real dialogs: tests drive them through the DOM
		openRowsCustomize: (config) => new RowsCustomizeModal(env.f.app, settingsService, config).open(),
		renameGroup: vi.fn(),
		searchHelp: vi.fn(),
		confirm: confirmWith(env.f.app),
	} satisfies ListTabModals;
	const host: ListTabHost = { getCardMinWidth: () => 150, isCardTextUnder: () => false, importProgress: () => null };
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new ListTab(
		container, settingsService, env.dm, {} as never, posters, { getEntries: () => [] }, host, modals,
	);
	return { ...env, tab, container, modals, host, posters, settingsService };
}
