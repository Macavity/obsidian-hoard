import { describe, expect, it, vi } from 'vitest';
import { GamesTab } from '../src/GamesTab';
import { defaultGamesSettings, DEFAULT_SETTINGS, type Game } from '../src/types';

const game = (id: string, over: Partial<Game> = {}): Game => ({
	id, title: id, type: 'RPG', status: 'Playing', priority: '', favorite: false, wishlist: false, rating: 0,
	progress: 0, playtimeMinutes: 0, coverUrl: '', dateAdded: '2024-01-01T00:00:00.000Z', dateStarted: null,
	dateFinished: null, releaseDate: null, ...over,
} as unknown as Game);

interface Priv {
	compareGamesByKey: (key: string, dir: 'asc' | 'desc', a: Game, b: Game) => number;
	applyPreset: (p: unknown) => void;
	getRecentlyPlayedGames: (g: Game[]) => Game[];
	handleCoversVisible: (cards: HTMLElement[]) => void;
	resolveCover: (g: Game) => Promise<unknown>;
	coverFetchFailed: Set<string>;
	filterGenreExclude: Set<string>;
	filterFavoritesOnly: boolean;
	filterGroupExclude: Set<string>;
	filterRatingEmptyOnly: boolean;
	filterWishlistOnly: boolean;
	filterGroupsOnly: boolean;
	filterRecentlyArrivedOnly: boolean;
	filterPriorityExclude: Set<string>;
}

function build(games: Game[] = []) {
	const settings = defaultGamesSettings();
	const gameData = {
		onChange: () => {}, offChange: () => {},
		getSavedFilterPreset: () => null,
		getGames: () => games,
		getSettings: () => settings,
		updateCoverAndSource: vi.fn(() => Promise.resolve()),
		updateCoverUrl: vi.fn(() => Promise.resolve()),
	};
	const plugin = { app: {}, settings: { ...DEFAULT_SETTINGS }, isCardTextUnder: () => false, getCardMinWidth: () => 150 };
	const tab = new GamesTab(document.createElement('div'), plugin as never, gameData as never);
	return { p: tab as unknown as Priv, gameData, settings };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('GamesTab.compareGamesByKey', () => {
	const { p, settings } = build();
	const a = game('a', { title: 'Alpha', progress: 10, playtimeMinutes: 5, rating: 2, priority: 'High', dateStarted: '2024-01-01', dateFinished: null, releaseDate: '2024-03-01', dateAdded: '2024-01-01T00:00:00.000Z', status: settings.statuses[0]!.name });
	const b = game('b', { title: 'Beta', progress: 20, playtimeMinutes: 0, rating: 0, priority: '', dateStarted: '2024-02-01', dateFinished: '2024-04-01', releaseDate: null, dateAdded: '2024-02-01T00:00:00.000Z', status: settings.statuses[1]!.name });
	const sign = (n: number) => Math.sign(n);

	it('orders by every sort key in both directions', () => {
		const cases: Array<[string, number, number]> = [
			['title', -1, 1],
			['dateAdded', -1, 1],
			['progress', -1, 1],
			['playtime', -1, -1],
			['rating', -1, -1],
			['priority', -1, -1],
			['started', -1, 1],
			['status', -1, 1],
			['dateFinished', 1, 1],
			['releaseDate', -1, -1],
		];
		for (const [key, asc, desc] of cases) {
			expect(sign(p.compareGamesByKey(key, 'asc', a, b)), `${key} asc`).toBe(asc);
			expect(sign(p.compareGamesByKey(key, 'desc', a, b)), `${key} desc`).toBe(desc);
		}
	});

	it('keeps unset dates last and falls back to 0 for unknown keys', () => {
		const none = game('n');
		expect(p.compareGamesByKey('started', 'asc', none, none)).toBe(0);
		expect(p.compareGamesByKey('dateFinished', 'asc', a, b)).toBe(1);
		expect(p.compareGamesByKey('dateFinished', 'desc', b, a)).toBe(-1);
		expect(p.compareGamesByKey('bogus', 'asc', a, b)).toBe(0);
		const unknownStatus = game('u', { status: 'Nope' });
		expect(p.compareGamesByKey('status', 'asc', a, unknownStatus)).toBeLessThan(0);
	});
});

describe('GamesTab.applyPreset', () => {
	it('copies every preset field with defaults for the optional ones', () => {
		const { p } = build();
		p.applyPreset({ genreExclude: ['RPG'], statusExclude: [], ratingExclude: [], priorityExclude: ['Low'], platformExclude: [] });
		expect([...p.filterGenreExclude]).toEqual(['RPG']);
		expect([...p.filterPriorityExclude]).toEqual(['Low']);
		expect([p.filterFavoritesOnly, p.filterWishlistOnly, p.filterGroupsOnly, p.filterRatingEmptyOnly, p.filterRecentlyArrivedOnly]).toEqual([false, false, false, false, false]);
		p.applyPreset({
			genreExclude: [], statusExclude: [], ratingExclude: [], priorityExclude: [], platformExclude: [], groupExclude: ['g'],
			ratingEmptyOnly: true, recentlyArrivedOnly: true, favoritesOnly: true, wishlistOnly: true, groupsOnly: true,
		});
		expect([p.filterFavoritesOnly, p.filterWishlistOnly, p.filterGroupsOnly, p.filterRatingEmptyOnly, p.filterRecentlyArrivedOnly]).toEqual([true, true, true, true, true]);
		expect([...p.filterGroupExclude]).toEqual(['g']);
	});
});

describe('GamesTab.getRecentlyPlayedGames', () => {
	it('keeps played games, newest lastPlayed first, then by modification date', () => {
		const { p } = build();
		const list = [
			game('idle'),
			game('mod-old', { progress: 5, dateModified: '2024-01-01' }),
			game('mod-new', { progress: 5, dateModified: '2024-06-01' }),
			game('lp-old', { playtimeMinutes: 1, lastPlayed: '2024-02-01' }),
			game('lp-new', { playtimeMinutes: 1, lastPlayed: '2024-03-01' }),
			game('started', { dateStarted: '2024-01-01' }),
			game('nomod', { dateFinished: '2024-01-01' }),
		];
		const ids = p.getRecentlyPlayedGames(list).map((g) => g.id);
		expect(ids.slice(0, 2)).toEqual(['lp-new', 'lp-old']);
		expect(ids).not.toContain('idle');
		expect(ids.indexOf('mod-new')).toBeLessThan(ids.indexOf('mod-old'));
	});
});

describe('GamesTab.handleCoversVisible', () => {
	const card = (id?: string): HTMLElement => {
		const c = document.createElement('div');
		if (id) c.dataset.gameId = id;
		const img = document.createElement('img');
		img.className = 'hoard-card-poster';
		const ph = document.createElement('div');
		ph.className = 'hoard-card-poster-placeholder';
		c.append(img, ph);
		return c;
	};

	it('persists resolved covers (with or without a source) and remembers failures', async () => {
		const games = [game('a'), game('b'), game('c'), game('has', { coverUrl: 'x' })];
		const { p, gameData } = build(games);
		const resolve = vi.spyOn(p, 'resolveCover').mockImplementation((g: Game) => Promise.resolve(
			g.id === 'a' ? { url: 'https://img/a.jpg', source: 'rawg', apiId: '7' }
				: g.id === 'b' ? { url: 'https://img/b.jpg', source: '', apiId: '' }
					: { url: '', source: '', apiId: '' }));
		const ca = card('a');
		p.handleCoversVisible([card(), card('missing'), card('has'), ca, card('b'), card('c')]);
		expect(ca.querySelector('.hoard-card-poster-placeholder')!.classList.contains('is-loading')).toBe(true);
		await flush();
		expect(resolve).toHaveBeenCalledTimes(3);
		expect(gameData.updateCoverAndSource).toHaveBeenCalledWith('a', 'https://img/a.jpg', 'rawg', '7');
		expect(gameData.updateCoverUrl).toHaveBeenCalledWith('b', 'https://img/b.jpg');
		expect(p.coverFetchFailed.has('c')).toBe(true);
		const img = ca.querySelector<HTMLImageElement>('.hoard-card-poster')!;
		img.onload!(new Event('load'));
		expect(ca.classList.contains('has-poster')).toBe(true);
		img.onerror!(new Event('error'));
		expect(ca.classList.contains('has-poster')).toBe(false);
		p.handleCoversVisible([card('c')]);
		expect(resolve).toHaveBeenCalledTimes(3);
	});
});
