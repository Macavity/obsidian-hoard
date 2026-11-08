// Real DataManager on a fake vault + a ListTab mounted in happy-dom.
import { vi } from 'vitest';
import { setupDataManager } from './setupDataManager';
import { ListTab } from '../../src/ListTab';
import type { HoardPluginSettings, HoardTitle } from '../../src/types';

// Obsidian's activeDocument (popout-aware document); common.ts stubs it with a bare object
(globalThis as { activeDocument?: Document }).activeDocument = document;

export const movieNote = (title: string, extra = ''): string =>
	`---\ntitle: ${title}\ntype: Movie\n${extra}---\n`;

export const showNote = (title: string, extra = ''): string =>
	`---\ntitle: ${title}\ntype: TV Show\nseasons: ["Season 1: 4"]\n${extra}---\n`;

export type PosterEnqueue = (title: HoardTitle) => Promise<string | null>;

export async function setupListTab(
	files: Record<string, string>,
	settings: Partial<HoardPluginSettings> = {},
	view: 'list' | 'rows' = 'list',
	enqueue: PosterEnqueue = () => Promise.resolve(null),
) {
	const extra = {
		posterService: { enqueue: vi.fn(enqueue), clearQueue: vi.fn() },
		getCardMinWidth: () => 150,
		isCardTextUnder: () => false,
		historyManager: { getEntries: () => [] },
		importProgress: undefined,
		saveSettings: vi.fn(() => Promise.resolve()),
	};
	const env = await setupDataManager(files, extra);
	Object.assign(env.plugin.settings, { defaultWatchlistView: view, ...settings });
	Object.assign(env.plugin, extra, { dataManager: env.dm });
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new ListTab(container, env.plugin, env.dm);
	return { ...env, tab, container };
}
