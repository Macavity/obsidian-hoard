import { describe, expect, it } from 'vitest';
import { ListTab } from '../../src/ListTab';
import type { HoardTitle } from '../../src/types';

type Compare = (key: string, a: HoardTitle, b: HoardTitle) => number;

// a minimal `this` for the comparator: numbers come straight off the fixture
const host = Object.assign(Object.create(ListTab.prototype) as object, {
	dataManager: {
		getProgress: (t: HoardTitle) => (t as unknown as { p: number }).p,
		calcTimeRemaining: (t: HoardTitle) => (t as unknown as { left: number }).left,
		calcTimeWatched: (t: HoardTitle) => (t as unknown as { watched: number }).watched,
	},
	getStatusIndex: (s: string) => ['Watching', 'Completed'].indexOf(s),
});
const compare = (key: string, a: HoardTitle, b: HoardTitle): number =>
	(ListTab.prototype as unknown as { compareTitlesByKey: Compare }).compareTitlesByKey.call(host, key, a, b);

const title = (over: Record<string, unknown>): HoardTitle => ({
	title: 'A', dateAdded: '2026-01-01', rating: 0, priority: '', status: 'Watching',
	p: 0, left: 0, watched: 0, ...over,
}) as unknown as HoardTitle;

const a = title({ title: 'Alpha', dateAdded: '2026-01-01', p: 10, rating: 2, priority: 'Low', dateStarted: '2026-02-01', status: 'Watching', dateFinished: '2026-03-01', left: 5, watched: 50 });
const b = title({ title: 'Beta', dateAdded: '2026-01-05', p: 80, rating: 4, priority: 'High', dateStarted: '2026-02-10', status: 'Completed', dateFinished: '2026-03-09', left: 1, watched: 90 });
const none = title({ title: 'None' });

describe('ListTab sort comparator', () => {
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

	it('puts titles without dates last where the key asks for it', () => {
		expect(compare('started-asc', a, none)).toBeLessThan(0);
		expect(compare('started-desc', none, a)).toBe(1);
		expect(compare('started-desc', a, none)).toBe(-1);
		expect(compare('started-desc', none, none)).toBe(0);
		expect(compare('dateWatched-newest', none, a)).toBeGreaterThan(0);
		expect(compare('dateWatched-oldest', a, none)).toBeLessThan(0);
		expect(compare('rating-high', none, a)).toBe(1);
	});

	it('treats an unknown key as equal', () => {
		expect(compare('bogus', a, b)).toBe(0);
	});
});
