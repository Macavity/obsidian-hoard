import { isReleaseDateFuture } from '../../../shared/domain/date';
import type { AirtimeSchedule } from './model';

export interface ReadingTotals {
	totalChapters: number;
	totalVolumes?: number;
	releaseDate: string | null;
}

/**
 * The fields a schedule changes on a reading item. A release date is written back only for a
 * future 'once' date (it drives the auto "To be released"); a past/due date is left alone so the
 * just-added entry isn't auto-removed.
 */
export function readingSchedulePatch(
	current: ReadingTotals,
	schedule: AirtimeSchedule,
	totals: { chapters: number | null; volumes: number | null },
): Partial<ReadingTotals> {
	const patch: Partial<ReadingTotals> = {};
	if (totals.chapters !== null && totals.chapters !== current.totalChapters) patch.totalChapters = totals.chapters;
	if (totals.volumes !== null && totals.volumes !== current.totalVolumes) patch.totalVolumes = totals.volumes;
	if (schedule.recurrence === 'once' && isReleaseDateFuture(schedule.releaseDate)) {
		const newDate = schedule.releaseDate ?? null;
		if (current.releaseDate !== newDate) patch.releaseDate = newDate;
	}
	return patch;
}
