import { describe, expect, it } from 'vitest';
import { ReadingScheduleModal } from '../../src/ReadingScheduleModal';
import type { Book, Manga } from '../../src/types';

type Counters = { totalChapters: number | null; totalVolumes: number | null; currentVolume: number | null; currentChapter: number | null };

const make = (item: Partial<Book & Manga>, kind: 'book' | 'manga', totals: [number | null, number | null] = [null, null]) =>
	new ReadingScheduleModal({ app: {} as never }, item as Book, kind, null, 2, 5, totals[0], totals[1], async () => {}) as unknown as Counters;

describe('ReadingScheduleModal counters', () => {
	it('keeps the given current counters', () => {
		const m = make({}, 'manga');
		expect([m.currentVolume, m.currentChapter]).toEqual([2, 5]);
	});

	it('prefills the totals from the tracked manga counts', () => {
		const m = make({ totalChapters: 120, totalVolumes: 12 }, 'manga');
		expect([m.totalChapters, m.totalVolumes]).toEqual([120, 12]);
	});

	it('leaves unknown totals empty and ignores volumes for books', () => {
		const book = make({ totalVolumes: 3 }, 'book');
		expect([book.totalChapters, book.totalVolumes]).toEqual([null, null]);
	});

	it('prefers totals the schedule already carries', () => {
		const m = make({ totalChapters: 120, totalVolumes: 12 }, 'manga', [8, 90]);
		expect([m.totalVolumes, m.totalChapters]).toEqual([8, 90]);
	});
});
