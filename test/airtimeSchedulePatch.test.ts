import { describe, it, expect } from 'vitest';
import { readingSchedulePatch } from '../src/modules/airtime/domain/schedulePatch';

const base = { totalChapters: 10, releaseDate: null as string | null };
const none = { chapters: null, volumes: null };

describe('readingSchedulePatch', () => {
	it('patches changed chapter totals', () => {
		expect(readingSchedulePatch(base, { recurrence: 'weekly' }, { chapters: 12, volumes: null })).toEqual({ totalChapters: 12 });
	});
	it('returns nothing for equal or missing totals', () => {
		expect(readingSchedulePatch(base, { recurrence: 'weekly' }, { chapters: 10, volumes: null })).toEqual({});
		expect(readingSchedulePatch(base, { recurrence: 'weekly' }, none)).toEqual({});
	});
	it('writes a future once date', () => {
		expect(readingSchedulePatch(base, { recurrence: 'once', releaseDate: '2099-01-01' }, none)).toEqual({ releaseDate: '2099-01-01' });
	});
	it('skips an unchanged future once date', () => {
		expect(readingSchedulePatch({ ...base, releaseDate: '2099-01-01' }, { recurrence: 'once', releaseDate: '2099-01-01' }, none)).toEqual({});
	});
	it('ignores a past once date', () => {
		expect(readingSchedulePatch(base, { recurrence: 'once', releaseDate: '2000-01-01' }, none)).toEqual({});
	});
	it('ignores the date for non-once recurrences', () => {
		expect(readingSchedulePatch(base, { recurrence: 'weekly', releaseDate: '2099-01-01' }, none)).toEqual({});
	});
	it('patches changed volumes', () => {
		expect(readingSchedulePatch({ ...base, totalVolumes: 3 }, { recurrence: 'weekly' }, { chapters: null, volumes: 4 })).toEqual({ totalVolumes: 4 });
	});
});
