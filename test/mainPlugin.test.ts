import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, Notice } from './__mocks__/obsidian';
import HoardPlugin from '../src/main';
import { HoardView } from '../src/HoardView';
import { HoardSettingsTab } from '../src/SettingsTab';
import { LAST_USED_TYPE_SENTINEL } from '../src/types';

const plugin = (props: Record<string, unknown>): HoardPlugin =>
	Object.assign(Object.create(HoardPlugin.prototype) as HoardPlugin, props);
const priv = (p: HoardPlugin) => p as unknown as {
	activateView(tab?: string): Promise<void>;
	openWidgetPalette(editor: { replaceSelection(s: string): void }): void;
};

afterEach(() => {
	Notice.shown.length = 0;
	vi.restoreAllMocks();
});

describe('resolveDefaultAddType', () => {
	const types = [{ name: 'Movie' }, { name: 'Anime' }];
	const resolve = (s: Record<string, unknown>) => plugin({ settings: { types, ...s } }).resolveDefaultAddType();

	it('follows the last added type for the sentinel and falls back to the first', () => {
		expect(resolve({ defaultAddType: LAST_USED_TYPE_SENTINEL, lastAddedType: 'Anime' })).toBe('Anime');
		expect(resolve({ lastAddedType: 'Gone' })).toBe('Movie');
	});

	it('keeps an existing chosen type and falls back when it is gone', () => {
		expect(resolve({ defaultAddType: 'Anime' })).toBe('Anime');
		expect(resolve({ defaultAddType: 'Gone' })).toBe('Movie');
		expect(plugin({ settings: { types: [] } }).resolveDefaultAddType()).toBe('');
	});
});

describe('applyCardSizeCssVar', () => {
	it('writes to the main window, also while the settings window has the focus', () => {
		// Obsidian mirrors the main body's custom properties into its other windows, not the other way round
		const settingsWindow = document.implementation.createHTMLDocument('settings');
		vi.stubGlobal('activeDocument', settingsWindow);
		try {
			plugin({ settings: { cardSize: 3, cardSizeMobile: 3 } }).applyCardSizeCssVar();
		} finally {
			vi.unstubAllGlobals();
		}
		expect(document.body.style.getPropertyValue('--hoard-card-minimum-width')).toMatch(/^\d+px$/);
		expect(settingsWindow.body.style.getPropertyValue('--hoard-card-minimum-width')).toBe('');
	});
});

describe('activateView', () => {
	it('reveals an existing view and switches its tab', async () => {
		const view = Object.assign(Object.create(HoardView.prototype) as HoardView, { setActiveTab: vi.fn() });
		const leaf = { view, setViewState: vi.fn() };
		const workspace = { getLeavesOfType: () => [leaf], revealLeaf: vi.fn(), getLeaf: vi.fn() };
		await priv(plugin({ app: { workspace } })).activateView('calendar');
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
		expect(view.setActiveTab).toHaveBeenCalledWith('calendar');
		expect(workspace.getLeaf).not.toHaveBeenCalled();
	});

	it('opens a new tab when none exists', async () => {
		const leaf = { view: {}, setViewState: vi.fn(() => Promise.resolve()) };
		const workspace = { getLeavesOfType: () => [], revealLeaf: vi.fn(), getLeaf: vi.fn(() => leaf) };
		await priv(plugin({ app: { workspace } })).activateView();
		expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
		expect(leaf.setViewState).toHaveBeenCalledTimes(1);
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
	});
});

describe('openWidgetPalette', () => {
	type Chooser = { getItems(): { id: string }[]; onChooseItem(i: unknown): void };
	function open(titles: unknown[]) {
		const opened: Chooser[] = [];
		vi.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) { opened.push(this as unknown as Chooser); });
		const written: string[] = [];
		const p = plugin({ app: {}, dataManager: { getTitles: () => titles } });
		priv(p).openWidgetPalette({ replaceSelection: (s) => written.push(s) });
		const palette = opened[0]!;
		const choose = (id: string) => palette.onChooseItem(palette.getItems().find((i) => i.id === id));
		return { opened, written, choose };
	}

	it('inserts the static widgets', () => {
		const { written, choose } = open([]);
		for (const id of ['hoard-stat:watched', 'hoard-stat:completed', 'hoard-stat:remaining', 'hoard-stat:time',
			'hoard-upcoming:next', 'hoard-stat:time completed full', 'hoard-now-next']) choose(id);
		expect(written).toEqual([
			'```hoard-stat\nwatched\n```', '```hoard-stat\ncompleted\n```', '```hoard-stat\nremaining\n```',
			'```hoard-stat\ntime\n```', '```hoard-upcoming\nnext\n```', '```hoard-stat\ntime completed full\n```',
			'```hoard-now-next\n```',
		]);
	});

	it('warns for a todo widget without titles', () => {
		const { written, choose, opened } = open([]);
		choose('hoard-todo');
		expect(Notice.shown).toHaveLength(1);
		expect(written).toEqual([]);
		expect(opened).toHaveLength(1);
	});

	it('asks for a title for the todo widgets', () => {
		const { written, choose, opened } = open([{ title: 'Dark' }]);
		choose('hoard-todo');
		opened[1]!.onChooseItem({ title: 'Dark' });
		choose('hoard-todo:mini');
		opened[2]!.onChooseItem({ title: 'Dark' });
		expect(written).toEqual(['```hoard-todo\nDark\n```', '```hoard-todo\nDark\nmini\n```']);
	});
});

describe('HoardSettingsTab.gamesFilterRefs', () => {
	it('lists the live and saved-preset exclusions of the axis', () => {
		const live = { genreExclude: ['RPG'], platformExclude: ['PC'] };
		const preset = { genreExclude: ['Indie'] };
		const tab = Object.assign(Object.create(HoardSettingsTab.prototype) as HoardSettingsTab, {
			plugin: { settings: { gamesFilters: live }, gameDataManager: { getSettings: () => ({ savedFilterPreset: preset }) } },
		});
		const refs = (kind: 'type' | 'platform') => (tab as unknown as { gamesFilterRefs(k: string): string[][] }).gamesFilterRefs(kind);
		expect(refs('type')).toEqual([['RPG'], ['Indie']]);
		expect(refs('platform')).toEqual([['PC']]);
		// the very arrays, so renames and deletions reach the stored exclusions
		expect(refs('type')[0]).toBe(live.genreExclude);
		expect(refs('type')[1]).toBe(preset.genreExclude);
		expect(refs('platform')[0]).toBe(live.platformExclude);
	});
});
