import { describe, expect, it } from 'vitest';
import { GAMES_ROWS_SHELVES, READING_ROWS_SHELVES, normalizeRowsLayout, type RowsShelfLayoutEntry } from '../src/types';

/** `id` for an enabled shelf, `-id` for a disabled one: a layout on one line. */
const brief = (layout: RowsShelfLayoutEntry[]): string[] => layout.map((e) => (e.enabled ? e.id : `-${e.id}`));

/** The function takes whatever was stored. */
const normalize: (stored: unknown, ...rest: unknown[]) => RowsShelfLayoutEntry[] = normalizeRowsLayout;

const WATCHLIST = ['favorites', 'recommended', 'recentlyAdded', 'recentlyWatched', 'groups', 'recentlyReleased', 'byType', '-byStatus'];

describe('normalizeRowsLayout: nothing stored', () => {
	it('gives the watchlist shelves in registry order with By status off', () => {
		expect(brief(normalize(undefined))).toEqual(WATCHLIST);
		expect(brief(normalize([]))).toEqual(WATCHLIST);
	});

	it('treats null and text as nothing stored', () => {
		expect(brief(normalize(null))).toEqual(WATCHLIST);
		expect(brief(normalize('abc'))).toEqual(WATCHLIST);
	});

	it('gives the games shelves', () => {
		expect(brief(normalize(undefined, GAMES_ROWS_SHELVES)))
			.toEqual(['favorites', 'recommended', 'recentlyAdded', 'recentlyPlayed', 'groups', 'recentlyReleased', 'byType', '-byStatus']);
	});

	it('gives the reading shelves, By status on because nothing excludes it', () => {
		expect(brief(normalize(undefined, READING_ROWS_SHELVES, [])))
			.toEqual(['favorites', 'recentlyAdded', 'recentlyRead', 'recentlyReleased', 'byStatus']);
	});
});

describe('normalizeRowsLayout: stored entries', () => {
	it('keeps the stored order and appends the shelves that are missing, enabled', () => {
		const stored = [{ id: 'groups', enabled: false }, { id: 'favorites', enabled: true }, { id: 'byType', enabled: true }];
		expect(brief(normalize(stored)))
			.toEqual(['-groups', 'favorites', 'byType', 'recommended', 'recentlyAdded', 'recentlyWatched', 'recentlyReleased', '-byStatus']);
	});

	it('drops an unknown id and the second occurrence of an id', () => {
		const stored = [
			{ id: 'groups', enabled: false },
			{ id: 'nope', enabled: true },
			{ id: 'groups', enabled: true },
			{ id: 'recentlyPlayed', enabled: true },
		];
		expect(brief(normalize(stored)))
			.toEqual(['-groups', 'favorites', 'recommended', 'recentlyAdded', 'recentlyWatched', 'recentlyReleased', 'byType', '-byStatus']);
	});

	it('reads a missing enabled as on and only false as off', () => {
		const stored = [{ id: 'groups' }, { id: 'favorites', enabled: false }, { id: 'recommended', enabled: 0 }, { id: 'recentlyAdded', enabled: null }];
		expect(brief(normalize(stored)).slice(0, 4)).toEqual(['groups', '-favorites', 'recommended', 'recentlyAdded']);
	});

	it('returns new entries and leaves the stored ones alone', () => {
		const stored = [{ id: 'byType', enabled: true }, { id: 'byStatus', enabled: true }];
		const result = normalize(stored);
		expect(stored).toEqual([{ id: 'byType', enabled: true }, { id: 'byStatus', enabled: true }]);
		expect(result[0]).not.toBe(stored[0]);
		expect(result[1]).not.toBe(stored[1]);
	});
});

describe('normalizeRowsLayout: exclusive shelves', () => {
	it('appends By status off next to a stored By type, also a disabled one', () => {
		expect(brief(normalize([{ id: 'byType', enabled: true }])).filter((s) => s.includes('by'))).toEqual(['byType', '-byStatus']);
		expect(brief(normalize([{ id: 'byType', enabled: false }])).filter((s) => s.includes('by'))).toEqual(['-byType', '-byStatus']);
	});

	it('appends By type off next to a stored By status', () => {
		expect(brief(normalize([{ id: 'byStatus', enabled: true }])).slice(0, 1)).toEqual(['byStatus']);
		expect(brief(normalize([{ id: 'byStatus', enabled: true }])).at(-1)).toBe('-byType');
	});

	it('leaves the first on and switches the second off when both are stored on', () => {
		expect(brief(normalize([{ id: 'byStatus', enabled: true }, { id: 'byType', enabled: true }])).slice(0, 2)).toEqual(['byStatus', '-byType']);
		expect(brief(normalize([{ id: 'byType', enabled: true }, { id: 'byStatus', enabled: true }])).slice(0, 2)).toEqual(['byType', '-byStatus']);
	});

	it('keeps the second on when the first is stored off', () => {
		expect(brief(normalize([{ id: 'byType', enabled: false }, { id: 'byStatus', enabled: true }])).slice(0, 2)).toEqual(['-byType', 'byStatus']);
	});

	it('heals each of two groups on its own', () => {
		const shelves = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
		const groups = [['a', 'b'], ['c', 'd']];
		const all = shelves.map((s) => ({ id: s.id, enabled: true }));
		expect(brief(normalize(all, shelves, groups))).toEqual(['a', '-b', 'c', '-d', 'e']);
		expect(brief(normalize([{ id: 'd', enabled: true }], shelves, groups))).toEqual(['d', 'a', '-b', '-c', 'e']);
		expect(brief(normalize(undefined, shelves, groups))).toEqual(['a', '-b', 'c', '-d', 'e']);
	});

	it('lets both grouped shelves be on without groups', () => {
		const stored = [{ id: 'byType', enabled: true }, { id: 'byStatus', enabled: true }];
		expect(brief(normalize(stored, GAMES_ROWS_SHELVES, [])).slice(0, 2)).toEqual(['byType', 'byStatus']);
	});
});

describe('normalizeRowsLayout: stored values that are no layout (as today)', () => {
	it('breaks on an entry that is no object and on a number', () => {
		expect(() => normalize([null])).toThrow(TypeError);
		expect(() => normalize(5)).toThrow(TypeError);
	});
});
