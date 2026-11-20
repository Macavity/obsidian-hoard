import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal, Notice } from './__mocks__/obsidian';
import HoardPlugin from '../src/app/main';
import { HoardView } from '../src/app/HoardView';
import { DEFAULT_SETTINGS } from '../src/modules/settings/domain/settingsDefaults';

const plugin = (props: Record<string, unknown>): HoardPlugin =>
	Object.assign(Object.create(HoardPlugin.prototype) as HoardPlugin, props);
const priv = (p: HoardPlugin) => p as unknown as {
	applyCardSizeCssVar(): void;
	activateView(tab?: string): Promise<void>;
	revealAdded(done: { kind: string; id: string }): Promise<void>;
	openWidgetPalette(editor: { replaceSelection(s: string): void }): void;
};

afterEach(() => {
	Notice.shown.length = 0;
	vi.restoreAllMocks();
});

describe('settings before they are loaded', () => {
	it('are a copy of the defaults, not the defaults themselves', () => {
		const fresh = priv(new (HoardPlugin as unknown as new () => HoardPlugin)()) as unknown as { state: typeof DEFAULT_SETTINGS };
		expect(fresh.state).toEqual(DEFAULT_SETTINGS);
		expect(fresh.state).not.toBe(DEFAULT_SETTINGS);
		expect(fresh.state.types).not.toBe(DEFAULT_SETTINGS.types);
	});
});

describe('applyCardSizeCssVar', () => {
	it('writes to the main window, also while the settings window has the focus', () => {
		// Obsidian mirrors the main body's custom properties into its other windows, not the other way round
		const settingsWindow = document.implementation.createHTMLDocument('settings');
		vi.stubGlobal('activeDocument', settingsWindow);
		try {
			priv(plugin({ state: { cardSize: 3, cardSizeMobile: 3 } })).applyCardSizeCssVar();
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

describe('revealAdded', () => {
	const entry = { id: 't-Dark', title: 'Dark' };
	function setup(openAfter: boolean | undefined, known: unknown = entry) {
		const openTitleDetail = vi.fn();
		const p = plugin({
			state: { openWatchlistAfterAdd: openAfter },
			dataManager: { getTitle: () => known ?? undefined },
			watchlist: { openTitleDetail },
		});
		const activate = vi.spyOn(priv(p), 'activateView').mockResolvedValue();
		return { p: priv(p), activate, openTitleDetail };
	}

	it('opens the new title in the Watchlist by default', async () => {
		const { p, activate, openTitleDetail } = setup(undefined);
		await p.revealAdded({ kind: 'series', id: 't-Dark' });
		expect(activate).toHaveBeenCalledWith('watchlist');
		expect(openTitleDetail).toHaveBeenCalledWith({ title: entry });
	});

	it('only reveals the panel when the setting is off', async () => {
		const { p, activate, openTitleDetail } = setup(false);
		await p.revealAdded({ kind: 'movie', id: 't-Dark' });
		expect(activate).toHaveBeenCalledWith();
		expect(openTitleDetail).not.toHaveBeenCalled();
	});

	it('only reveals the panel for a kind that is not on the Watchlist', async () => {
		const { p, activate, openTitleDetail } = setup(true);
		await p.revealAdded({ kind: 'book', id: 'b1' });
		expect(activate).toHaveBeenCalledWith();
		expect(openTitleDetail).not.toHaveBeenCalled();
	});

	it('opens no detail for an entry that is gone', async () => {
		const { p, openTitleDetail } = setup(true, null);
		await p.revealAdded({ kind: 'anime', id: 'gone' });
		expect(openTitleDetail).not.toHaveBeenCalled();
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
