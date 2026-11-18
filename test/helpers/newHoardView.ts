import { WorkspaceLeaf } from 'obsidian';
import { fakeSettings } from './fakeSettings';
import { HoardView, type TabBadge, type TabFactory, type TabName } from '../../src/app/HoardView';
import type { TabInstance } from '../../src/shared/ui/TabInstance';

/** A tab that renders nothing. */
const stubTab = (): TabInstance => ({ render: () => {} });

const TAB_SHAPE: Omit<TabFactory, 'create'>[] = [
	{ name: 'dashboard', label: 'app.tabs.dashboard', icon: 'layout-dashboard', cls: 'hoard-dashboard' },
	{ name: 'watchlist', label: 'app.tabs.watchlist', icon: 'tv', cls: 'hoard-list' },
	{ name: 'upcoming', label: 'app.tabs.upcoming', icon: 'calendar', cls: 'hoard-airtime' },
	{ name: 'reading', label: 'app.tabs.reading', icon: 'book-open', cls: 'hoard-reading' },
	{ name: 'games', label: 'app.tabs.games', icon: 'gamepad-2', cls: 'hoard-games' },
	{ name: 'custom-lists', label: 'app.tabs.customLists', icon: 'list', cls: 'hoard-custom-lists' },
	{ name: 'drafts', label: 'app.tabs.drafts', icon: 'square-pen' },
	{ name: 'log', label: 'app.tabs.log', icon: 'history', cls: 'hoard-log' },
];

export interface StubTabOptions {
	/** Replaces the tab built for a name. */
	create?: Partial<Record<TabName, () => TabInstance>>;
	/** Count badges by tab name; the real view has them on Upcoming and Drafts. */
	badges?: Partial<Record<TabName, TabBadge>>;
}

/** The eight tabs in tab-bar order, each rendering nothing unless replaced. */
export function stubTabs(opts: StubTabOptions = {}): TabFactory[] {
	return TAB_SHAPE.map((shape) => ({
		...shape,
		create: opts.create?.[shape.name] ?? stubTab,
		badge: opts.badges?.[shape.name],
	}));
}

export interface HoardViewOptions extends StubTabOptions {
	/** Receives the metadata-cache `resolved` listener. */
	onResolved?: (cb: () => void) => void;
	importRunning?: () => boolean;
}

/** The view over fake collaborators and stub tabs. */
export function newHoardView(opts: HoardViewOptions = {}): HoardView {
	const onResolved = opts.onResolved ?? (() => {});
	return new HoardView(
		new WorkspaceLeaf(),
		fakeSettings({ colorTheme: 'default' }) as never,
		{ onChange: () => {}, offChange: () => {} },
		{ on: (_name: string, cb: () => void) => { onResolved(cb); return {}; } } as never,
		stubTabs(opts),
		opts.importRunning ?? (() => false),
	);
}
