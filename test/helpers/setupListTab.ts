// Real DataManager on a fake vault + a ListTab mounted in happy-dom.
import { vi } from 'vitest';
import { setupDataManager } from './setupDataManager';
import { ListTab, type ListTabDeps } from '../../src/ListTab';
import { fakeSettings } from './fakeSettings';
import type { HoardPluginSettings, HoardTitle } from '../../src/types';

// Obsidian's activeDocument (popout-aware document); common.ts stubs it with a bare object
(globalThis as { activeDocument?: Document }).activeDocument = document;

export const movieNote = (title: string, extra = ''): string =>
	`---\nName: ${title}\nType: Movie\n${extra}---\n`;

export const showNote = (title: string, extra = ''): string =>
	`---\nName: ${title}\nType: TV Show\nSeasons: ["Season 1: 4"]\n${extra}---\n`;

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
	const deps = {
		app: env.f.app,
		settings: settingsService,
		titles: env.dm,
		api: {},
		posters,
		history: { getEntries: () => [] },
		getCardMinWidth: () => 150,
		isCardTextUnder: () => false,
		importProgress: () => null,
		resolveDefaultAddType: () => 'Movie',
	} as unknown as ListTabDeps;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const tab = new ListTab(container, deps);
	return { ...env, tab, container, deps, posters, settingsService };
}
