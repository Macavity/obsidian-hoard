import { afterEach, describe, expect, it, vi } from 'vitest';
import { GamesTab } from '../src/GamesTab';
import { defaultGamesSettings, DEFAULT_SETTINGS, type Game, type GameGroup } from '../src/types';
import { t } from '../src/i18n';

const groupModalOpened = vi.hoisted(() => vi.fn());

vi.mock('../src/RowsCustomizeModal', () => ({
	RowsCustomizeModal: class {
		constructor(_app: unknown, _plugin: unknown, opts: unknown) { customizeOpts = opts as CustomizeOpts; }
		open = vi.fn();
	},
}));

vi.mock('../src/GameDetailModal', () => ({
	GameDetailModal: class { open = vi.fn(); },
	GameGroupDetailModal: class { open = (): void => { groupModalOpened(); }; },
	gameGroupProgress: () => 0,
}));

const game = (id: string, over: Partial<Game> = {}): Game => ({
	id, title: id, developer: '', publisher: '', type: 'RPG', status: 'Playing', priority: '', favorite: false,
	wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0, achievementsEarned: 0, achievementsTotal: 0,
	platforms: [], singleplayer: true, coop: false, multiplayer: false, coverUrl: '', apiSource: '', apiId: '',
	dateAdded: '2024-01-01T00:00:00.000Z', releaseDate: null,
	...over,
} as unknown as Game);

interface Setup {
	games?: Game[];
	groups?: GameGroup[];
	rowsLayout?: { id: string; enabled: boolean }[];
	query?: string;
	favoritesOnly?: boolean;
}

function build(o: Setup = {}) {
	const games = o.games ?? [];
	const groups = o.groups ?? [];
	const settings = { ...defaultGamesSettings(), rowsLayout: o.rowsLayout };
	const grouped = new Set(groups.flatMap((g) => g.gameIds));
	const gameData = {
		onChange: () => {}, offChange: () => {},
		getSavedFilterPreset: () => null,
		getGames: () => games,
		getGroups: () => groups,
		getGroupedGameIds: () => grouped,
		getSettings: () => settings,
		persistQuiet: vi.fn(),
		getRecommendedDaily: () => ({ date: '', ids: [] as string[] }),
		setRecommendedDaily: vi.fn(),
	};
	const plugin = {
		app: {},
		settings: { ...DEFAULT_SETTINGS, gamesFilters: o.favoritesOnly ? { favoritesOnly: true } : undefined },
		isCardTextUnder: () => false,
		getCardMinWidth: () => 150,
	};
	const container = document.createElement('div');
	const content = document.createElement('div');
	container.appendChild(content);
	const tab = new GamesTab(container, plugin as never, gameData as never);
	const internals = tab as unknown as { contentEl: HTMLElement; renderContent: () => void; searchQuery: string };
	internals.contentEl = content;
	if (o.query) internals.searchQuery = o.query;
	internals.renderContent();
	return { tab, content, internals };
}

const only = (ids: string[]) => ['favorites', 'recommended', 'recentlyAdded', 'recentlyPlayed', 'groups', 'recentlyReleased', 'byType', 'byStatus']
	.map((id) => ({ id, enabled: ids.includes(id) }));

const titles = (el: HTMLElement) => Array.from(el.querySelectorAll('.hoard-rows-shelf-title')).map((e) => e.textContent ?? '');

interface CustomizeOpts {
	shelves: { id: string; label: string }[];
	getLayout: () => unknown;
	setLayout: (l: unknown) => void;
	persist: () => void;
	onChanged: () => void;
}
let customizeOpts: CustomizeOpts | null = null;

afterEach(() => { vi.restoreAllMocks(); customizeOpts = null; });

describe('GamesTab.renderContent', () => {
	it('shows the empty state without games or groups', () => {
		const { content } = build();
		expect(content.textContent).toContain(t('games.empty'));
	});

	it('renders the count line with games and groups', () => {
		const g1 = game('a');
		const g2 = game('b');
		const group = { id: 'grp', name: 'Zelda', gameIds: ['b'], dateAdded: '2024-01-01' };
		const { content } = build({ games: [g1, g2], groups: [group], rowsLayout: only(['favorites']) });
		const count = content.querySelector('.hoard-results-count')!.textContent!;
		expect(count).toContain(t('ui.group.countGame', { count: 1 }));
		expect(count).toContain(t('games.countGroup', { count: 1 }));
	});

	it('renders each enabled shelf with its title and cards', () => {
		const games = [game('fav', { favorite: true, dateFavorited: '2024-02-01' }), game('old', { releaseDate: '2000-01-01' })];
		const { content } = build({
			games,
			groups: [],
			rowsLayout: only(['favorites', 'recommended', 'recentlyAdded', 'recentlyPlayed', 'groups', 'recentlyReleased']),
		});
		const shown = titles(content);
		expect(shown.some((s) => s.startsWith(t('games.shelves.favorites')))).toBe(true);
		expect(shown.some((s) => s.startsWith(t('games.shelves.recommended')))).toBe(true);
		expect(shown.some((s) => s.startsWith(t('games.shelves.recentlyAdded')))).toBe(true);
		expect(shown.some((s) => s.startsWith(t('games.shelves.recentlyReleased')))).toBe(true);
		expect(shown.some((s) => s.startsWith(t('games.shelves.groups')))).toBe(true);
		expect(content.querySelector('.hoard-rows-shelf .hoard-card[data-game-id="fav"]')).not.toBeNull();
		expect(content.textContent).toContain(t('games.shelves.emptyGroups'));
	});

	it('renders the By genre grid and skips disabled sections', () => {
		const { content } = build({ games: [game('a', { type: 'RPG' })], rowsLayout: only(['byType']) });
		expect(content.querySelector('.hoard-rows-bytype-title')!.textContent).toBe(t('games.shelves.byGenre'));
		expect(content.textContent).toContain('RPG');
		expect(titles(content).some((s) => s.startsWith(t('games.shelves.favorites')))).toBe(false);
	});

	it('renders the By status grid with localized status names', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only(['byStatus']) });
		expect(content.querySelector('.hoard-rows-bytype-title')!.textContent).toBe(t('games.shelves.byStatus'));
	});

	it('falls back to the flat All games grid when no grouped grid is enabled', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only(['favorites']) });
		expect(content.textContent).toContain(t('games.shelves.allGames'));
	});

	it('omits the All games header when it is the only section', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only([]) });
		expect(content.textContent).not.toContain(t('games.shelves.allGames'));
		expect(content.querySelector('.hoard-rows-bytype')).not.toBeNull();
	});

	it('explains a search without matches', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only([]), query: 'zzzz' });
		expect(content.textContent).toContain(t('games.noMatchesQuery', { query: 'zzzz' }));
	});

	it('explains filters without matches', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only([]), favoritesOnly: true });
		expect(content.textContent).toContain(t('games.noMatchesFilters'));
	});

	it('hides grouped grids that have no matches while filtering and shows the empty hint otherwise', () => {
		const filtered = build({ games: [game('a')], rowsLayout: only(['byType']), query: 'zzzz' });
		expect(filtered.content.querySelector('.hoard-rows-bytype')).toBeNull();
		const empty = build({ games: [], groups: [{ id: 'g', name: 'G', gameIds: [], dateAdded: '' }], rowsLayout: only(['byType']) });
		expect(empty.content.textContent).toContain(t('games.shelves.emptyByGenre'));
		const emptyStatus = build({ games: [], groups: [{ id: 'g', name: 'G', gameIds: [], dateAdded: '' }], rowsLayout: only(['byStatus']) });
		expect(emptyStatus.content.textContent).toContain(t('games.shelves.emptyByStatus'));
	});

	it('renders group cards in the flat grid and rebuilds cleanly on a second render', () => {
		const group = { id: 'grp', name: 'Zelda', gameIds: ['a'], dateAdded: '2024-01-01' };
		const { content, internals } = build({ games: [game('a')], groups: [group], rowsLayout: only(['groups']) });
		expect(content.querySelectorAll('.hoard-rows-scroll-container')).toHaveLength(1);
		internals.renderContent();
		expect(content.querySelectorAll('.hoard-rows-scroll-container')).toHaveLength(1);
	});

	it('opens the rows customize modal from the gear button and wires its layout hooks', () => {
		const { content } = build({ games: [game('a')], rowsLayout: only([]) });
		(content.querySelector('.hoard-rows-customize-btn') as HTMLElement).click();
		expect(customizeOpts).not.toBeNull();
		expect(customizeOpts!.shelves.map((s) => s.id)).toContain('byType');
		expect(customizeOpts!.shelves.find((s) => s.id === 'byType')!.label).toBe(t('games.shelves.byGenre'));
		customizeOpts!.setLayout([{ id: 'favorites', enabled: true }]);
		expect(customizeOpts!.getLayout()).toEqual([{ id: 'favorites', enabled: true }]);
		customizeOpts!.persist();
		customizeOpts!.onChanged();
		expect(content.querySelectorAll('.hoard-rows-scroll-container')).toHaveLength(1);
	});

	it('renders group cards on the Groups shelf and opens the group detail on click', () => {
		const group = { id: 'grp', name: 'Zelda', gameIds: ['a'], dateAdded: '2024-01-01' };
		const { content } = build({ games: [game('a')], groups: [group], rowsLayout: only(['groups']) });
		const card = content.querySelector<HTMLElement>('.hoard-rows-strip .hoard-card, .hoard-rows-strip [data-group-id]');
		expect(card).not.toBeNull();
		expect(content.querySelector('.hoard-rows-strip')!.textContent).toContain('Zelda');
		card!.click();
		expect(groupModalOpened).toHaveBeenCalledTimes(1);
	});
});
