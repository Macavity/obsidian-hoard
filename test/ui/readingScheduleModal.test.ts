import { describe, expect, it } from 'vitest';
import { ReadingScheduleModal } from '../../src/modules/airtime/ui/ReadingScheduleModal';
import type { Book, Manga } from '../../src/shared/domain/types';

type Counters = { totalChapters: number | null; totalVolumes: number | null; currentVolume: number | null; currentChapter: number | null };

const make = (item: Partial<Book & Manga>, kind: 'book' | 'manga', totals: [number | null, number | null] = [null, null]) =>
	new ReadingScheduleModal({} as never, {
		item: item as Book, kind, existingSchedule: null, currentVolume: 2, currentChapter: 5,
		totalVolumes: totals[0], totalChapters: totals[1], onSave: async () => {},
	}) as unknown as Counters;

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
