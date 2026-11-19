import { describe, expect, it } from 'vitest';
import { newGamesTab } from './helpers/newGamesTab';
import { fakeSettings } from './helpers/fakeSettings';
import type { GamesSavedFilterPreset } from '../src/modules/games/contract';
import { DEFAULT_SETTINGS } from '../src/shared/domain/settingsDefaults';

const preset = (over: Partial<GamesSavedFilterPreset> = {}): GamesSavedFilterPreset => ({
	genreExclude: ['RPG'], statusExclude: [], ratingExclude: [], priorityExclude: [], platformExclude: [], groupExclude: [], ...over,
});

function build(saved: Record<string, unknown> | undefined, savedPreset: GamesSavedFilterPreset | null) {
	const settings = fakeSettings({ ...DEFAULT_SETTINGS, gamesFilters: saved } as never);
	const games = { onChange: () => {}, offChange: () => {}, getSavedFilterPreset: () => savedPreset };
	return newGamesTab(document.createElement('div'), { settings, games }) as unknown as {
		filterGenreExclude: Set<string>; filterFavoritesOnly: boolean; savedFilterActive: boolean;
		sort: { filterSort: string; filterSecondSortDir: string };
	};
}

const filters = (over: Record<string, unknown> = {}) => ({
	genreExclude: ['RPG'], statusExclude: [], ratingExclude: [], priorityExclude: [], platformExclude: [], groupExclude: [], ...over,
});

describe('GamesTab restores saved filters', () => {
	it('restores excludes, sort and flags', () => {
		const p = build(filters({ favoritesOnly: true, sort: 'title', secondSortDir: 'desc' }), null);
		expect([...p.filterGenreExclude]).toEqual(['RPG']);
		expect(p.filterFavoritesOnly).toBe(true);
		expect(p.sort.filterSort).toBe('title');
		expect(p.sort.filterSecondSortDir).toBe('desc');
		expect(p.savedFilterActive).toBe(false);
	});

	it('falls back to defaults without saved filters', () => {
		const p = build(undefined, null);
		expect(p.filterGenreExclude.size).toBe(0);
		expect(p.sort.filterSort).toBe('dateAdded');
	});

	it('highlights the preset while the filters match it', () => {
		expect(build(filters(), preset()).savedFilterActive).toBe(true);
	});

	it('drops the highlight when excludes or flags differ', () => {
		expect(build(filters(), preset({ genreExclude: ['Indie'] })).savedFilterActive).toBe(false);
		expect(build(filters({ favoritesOnly: true }), preset()).savedFilterActive).toBe(false);
	});
});
