import { describe, expect, it } from 'vitest';
import { setupListTab } from './helpers/setupListTab';
import type { SavedFilterPreset } from '../src/shared/domain/types';

const preset = (over: Partial<SavedFilterPreset> = {}): SavedFilterPreset => ({
	typeExclude: ['Movie'], statusExclude: [], groupExclude: [], ratingExclude: [], priorityExclude: [], ...over,
});
const saved = (over: Record<string, unknown> = {}) => ({
	typeExclude: ['Movie'], statusExclude: [], groupExclude: [], ratingExclude: [], priorityExclude: [], sort: 'title', sortDir: 'asc', secondSort: 'none', secondSortDir: 'asc', ...over,
}) as never;

type Priv = { filterTypeExclude: Set<string>; filterGroupsOnly: boolean; savedFilterActive: boolean; sort: { filterSort: string } };

const build = (listFilters: unknown) => setupListTab({}, { listFilters } as never);

describe('ListTab restores saved filters', () => {
	it('restores excludes, sort and flags', async () => {
		const { tab } = await build(saved({ groupsOnly: true }));
		const p = tab as unknown as Priv;
		expect([...p.filterTypeExclude]).toEqual(['Movie']);
		expect(p.filterGroupsOnly).toBe(true);
		expect(p.sort.filterSort).toBe('title');
		expect(p.savedFilterActive).toBe(false);
	});

	it('matchesPreset follows excludes and flags', async () => {
		const { tab } = await build(saved());
		const p = tab as unknown as { matchesPreset(x: SavedFilterPreset): boolean };
		expect(p.matchesPreset(preset())).toBe(true);
		expect(p.matchesPreset(preset({ typeExclude: ['Show'] }))).toBe(false);
		expect(p.matchesPreset(preset({ favoritesOnly: true }))).toBe(false);
	});
});
