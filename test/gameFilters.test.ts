import { describe, expect, it } from 'vitest';
import { gamePassesFilters, type GameFilterCriteria } from '../src/modules/games/domain/gameFilters';
import type { Game } from '../src/modules/games/domain/model';

const game = (over: Partial<Game> = {}): Game => ({
	id: 'g', title: 'g', type: 'RPG', status: 'Playing', priority: '', favorite: false, wishlist: false,
	rating: 0, platforms: [], releaseDate: null, ...over,
} as unknown as Game);

const criteria = (over: Partial<GameFilterCriteria> = {}): GameFilterCriteria => ({
	favoritesOnly: false, recentlyArrivedOnly: false, ratingEmptyOnly: false,
	typeExclude: new Set(), statusExclude: new Set(), ratingExclude: new Set(), priorityExclude: new Set(),
	wishlistOnly: false, platformExclude: new Set(),
	...over,
});

describe('gamePassesFilters', () => {
	it('passes with empty criteria', () => {
		expect(gamePassesFilters(game(), criteria())).toBe(true);
	});

	it('wishlistOnly drops non-wishlisted games', () => {
		expect(gamePassesFilters(game(), criteria({ wishlistOnly: true }))).toBe(false);
		expect(gamePassesFilters(game({ wishlist: true }), criteria({ wishlistOnly: true }))).toBe(true);
	});

	it('hides a game only when every platform is excluded', () => {
		const c = criteria({ platformExclude: new Set(['PC']) });
		expect(gamePassesFilters(game({ platforms: ['PC', 'PS5'] }), c)).toBe(true);
		expect(gamePassesFilters(game({ platforms: ['PC'] }), c)).toBe(false);
		expect(gamePassesFilters(game({ platforms: [] }), c)).toBe(true);
	});

	it('applies the genre as typeExclude on game.type', () => {
		expect(gamePassesFilters(game(), criteria({ typeExclude: new Set(['RPG']) }))).toBe(false);
	});

	it('applies the common filters', () => {
		expect(gamePassesFilters(game(), criteria({ favoritesOnly: true }))).toBe(false);
	});
});
