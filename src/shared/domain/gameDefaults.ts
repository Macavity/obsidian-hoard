import type { GamesSettings } from '../../modules/games/contract';

/** auto status forced by a future release date; excluded from manual dropdowns */
export const GAME_AUTO_STATUS = 'To be released';

/**
 * status the games log treats as finished (drives the 'completed' action and the
 * automatic finish-date stamp)
 */
export const GAME_FINISHED_STATUS = 'Finished';

/**
 * manual "to be announced": coming, but no known date. Never auto-applied or
 * auto-cleared, unlike GAME_AUTO_STATUS. Replaced the old 'Wishlist' status, which
 * became the `wishlist` flag on Game.
 */
export const GAME_TBA_STATUS = 'TBA';

/**
 * Fresh default settings. A factory, not a const: a shared const spread shallowly
 * into stored settings would alias its arrays into data.json, where a later edit
 * would silently mutate the "defaults" too.
 */
export function defaultGamesSettings(): GamesSettings {
	return {
		defaultFolder: 'Hoard/Games',
		defaultStatus: 'Not started',
		statuses: [
			{ name: 'Playing', color: '#3B82F6' },
			{ name: 'Not started', color: '#6B7280' },
			{ name: GAME_FINISHED_STATUS, color: '#22C55E' },
			{ name: 'Dropped', color: '#EF4444' },
			{ name: GAME_AUTO_STATUS, color: '#F59E0B' },
			{ name: GAME_TBA_STATUS, color: '#EAB308' },
		],
		types: [
			{ name: 'Adventure', color: '#8B5CF6' },
			{ name: 'RPG', color: '#3B82F6' },
			{ name: 'Shooter', color: '#EF4444' },
			{ name: 'Strategy', color: '#F59E0B' },
			{ name: 'Platformer', color: '#22C55E' },
			{ name: 'Racing', color: '#D85A30' },
			{ name: 'Simulation', color: '#1D9E75' },
			{ name: 'Sports', color: '#639922' },
			{ name: 'Puzzle', color: '#378ADD' },
			{ name: 'Fighting', color: '#993556' },
			{ name: 'Horror', color: '#5F5E5A' },
			{ name: 'Indie', color: '#D4537E' },
		],
		platforms: [
			{ name: 'Windows PC', color: '#378ADD' },
			{ name: 'PlayStation 5', color: '#1D4ED8' },
			{ name: 'Xbox Series X|S', color: '#22C55E' },
			{ name: 'Nintendo Switch 2', color: '#E24B4A' },
		],
	};
}
