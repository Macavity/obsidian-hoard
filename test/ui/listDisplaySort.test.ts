import { describe, expect, it } from 'vitest';
import { ListTab } from '../../src/ListTab';
import type { HoardGroup, HoardTitle } from '../../src/types';

type Item = { kind: 'title'; data: HoardTitle } | { kind: 'group'; data: HoardGroup; members: HoardTitle[] };
type Compare = (key: string, a: Item, b: Item) => number;

const host = Object.assign(Object.create(ListTab.prototype) as object, {
	STATUS_ORDER: ['Watching', 'Plan to watch', 'Completed', 'To be released', 'Dropped'],
	dataManager: {
		getProgress: (t: HoardTitle) => (t as unknown as { p: number }).p,
		calcTimeRemaining: (t: HoardTitle) => (t as unknown as { left: number }).left,
		calcTimeWatched: (t: HoardTitle) => (t as unknown as { watched: number }).watched,
		getEffectiveTotal: (t: HoardTitle) => (t as unknown as { total: number }).total,
	},
});
const compare = (key: string, a: Item, b: Item): number =>
	(ListTab.prototype as unknown as { compareDisplayItemsByKey: Compare }).compareDisplayItemsByKey.call(host, key, a, b);

const mk = (over: Record<string, unknown>): HoardTitle => ({
	title: 'A', dateAdded: '2026-01-01', rating: 0, priority: '', status: 'Watching',
	dateStarted: null, dateFinished: null, watchedEpisodes: [], p: 0, left: 0, watched: 0, total: 0, ...over,
}) as unknown as HoardTitle;
const ti = (over: Record<string, unknown>): Item => ({ kind: 'title', data: mk(over) });
const gr = (name: string, members: HoardTitle[]): Item =>
	({ kind: 'group', data: { id: name, name } as unknown as HoardGroup, members });

const a = ti({ title: 'Alpha', dateAdded: '2026-01-01', p: 10, rating: 2, priority: 'Low', dateStarted: '2026-02-01', status: 'Watching', dateFinished: '2026-03-01', left: 5, watched: 50 });
const b = ti({ title: 'Beta', dateAdded: '2026-01-05', p: 80, rating: 4, priority: 'High', dateStarted: '2026-02-10', status: 'Completed', dateFinished: '2026-03-09', left: 1, watched: 90 });
const none = ti({ title: 'None' });

describe('ListTab display item comparator (titles)', () => {
	it.each([
		['title-asc', -1], ['title-desc', 1],
		['dateAdded-newest', 1], ['dateAdded-oldest', -1],
		['progress-high', 1], ['progress-low', -1],
		['rating-high', 1], ['rating-low', -1],
		['priority', 1],
		['started-asc', -1], ['started-desc', 1],
		['status-asc', -1], ['status-desc', 1],
		['dateWatched-newest', 1], ['dateWatched-oldest', -1],
		['timeLeft-high', -1], ['timeLeft-low', 1],
		['timeWatched-high', 1], ['timeWatched-low', -1],
	])('%s orders Alpha against Beta', (key, sign) => {
		expect(Math.sign(compare(key, a, b))).toBe(sign);
		expect(Math.sign(compare(key, b, a))).toBe(-sign);
	});

	it('puts unset values last where the key asks for it', () => {
		expect(compare('started-asc', a, none)).toBeLessThan(0);
		expect(compare('started-asc', none, a)).toBe(1);
		expect(compare('started-asc', none, none)).toBe(0);
		expect(compare('started-desc', none, a)).toBe(1);
		expect(compare('started-desc', a, none)).toBe(-1);
		expect(compare('started-desc', none, none)).toBe(0);
		expect(compare('dateWatched-newest', none, a)).toBeGreaterThan(0);
		expect(compare('dateWatched-oldest', a, none)).toBeLessThan(0);
		expect(compare('rating-high', none, a)).toBe(1);
		expect(compare('rating-high', a, none)).toBe(-1);
		expect(compare('rating-low', none, none)).toBe(0);
		expect(compare('rating-low', none, a)).toBe(1);
	});

	it('treats an unknown key as equal', () => {
		expect(compare('bogus', a, b)).toBe(0);
	});
});

describe('ListTab display item comparator (groups)', () => {
	const g1 = gr('G1', [
		mk({ dateAdded: '2026-01-02', priority: 'Low', rating: 2, status: 'Watching', dateStarted: '2026-02-05', dateFinished: '2026-03-02', left: 2, watched: 10, total: 10, watchedEpisodes: [1, 2, 3, 4, 5] }),
		mk({ dateAdded: '2026-01-04', priority: 'High', rating: 4, status: 'Completed', dateStarted: '2026-02-03', dateFinished: '2026-03-04', left: 3, watched: 20, total: 10, watchedEpisodes: [1, 2, 3, 4, 5] }),
		mk({ dateAdded: '2026-01-03', rating: 0, status: 'Completed' }),
	]);
	const g2 = gr('G2', [
		mk({ dateAdded: '2026-01-10', priority: 'Low', rating: 5, status: 'Completed', dateStarted: '2026-04-01', dateFinished: '2026-05-01', left: 1, watched: 100, total: 10, watchedEpisodes: [1] }),
	]);
	const empty = gr('Empty', []);

	it('aggregates members per key', () => {
		// progress: g1 = 10/20 = 50%, g2 = 10%
		expect(compare('progress-high', g1, g2)).toBeLessThan(0);
		// date added: latest member (g1 Jan 4, g2 Jan 10)
		expect(compare('dateAdded-newest', g1, g2)).toBeGreaterThan(0);
		expect(compare('dateAdded-oldest', g1, g2)).toBeLessThan(0);
		// priority: best member (g1 High, g2 Low)
		expect(compare('priority', g1, g2)).toBeLessThan(0);
		// rating: average of rated members (g1 3, g2 5)
		expect(compare('rating-high', g1, g2)).toBeGreaterThan(0);
		expect(compare('rating-low', g1, g2)).toBeLessThan(0);
		// status: g1 Watching, g2 Completed
		expect(compare('status-asc', g1, g2)).toBeLessThan(0);
		expect(compare('status-desc', g1, g2)).toBeGreaterThan(0);
		// started: earliest member (g1 Feb 3, g2 Apr 1)
		expect(compare('started-asc', g1, g2)).toBeLessThan(0);
		expect(compare('started-desc', g1, g2)).toBeGreaterThan(0);
		// watched: latest finish (g1 Mar 4, g2 May 1)
		expect(compare('dateWatched-newest', g1, g2)).toBeGreaterThan(0);
		expect(compare('dateWatched-oldest', g1, g2)).toBeLessThan(0);
		// time left: sums (g1 5, g2 1); time watched: sums (g1 30, g2 100)
		expect(compare('timeLeft-high', g1, g2)).toBeLessThan(0);
		expect(compare('timeLeft-low', g1, g2)).toBeGreaterThan(0);
		expect(compare('timeWatched-high', g1, g2)).toBeGreaterThan(0);
		expect(compare('timeWatched-low', g1, g2)).toBeLessThan(0);
		// name
		expect(compare('title-asc', g1, g2)).toBeLessThan(0);
		expect(compare('title-desc', g1, g2)).toBeGreaterThan(0);
	});

	it('sorts an empty group last for unset-last keys and mixes with titles', () => {
		expect(compare('priority', empty, g2)).toBeGreaterThan(0);
		expect(compare('rating-high', empty, g1)).toBe(1);
		expect(compare('started-asc', empty, g1)).toBe(1);
		expect(compare('started-desc', empty, empty)).toBe(0);
		expect(compare('dateAdded-newest', g1, empty)).toBeLessThan(0); // empty group counts as time 0
		expect(compare('status-asc', empty, b)).toBeLessThan(0); // Plan to watch before Completed
		expect(compare('title-asc', a, g1)).toBeLessThan(0);
	});
});
