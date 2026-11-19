import type { AirtimeEntry, EntryAirtime } from '.';

/** The note-side schedule of an Upcoming entry; the 'once' date lives in the note's releaseDate. */
export function toEntryAirtime(e: AirtimeEntry): EntryAirtime {
	const s = e.schedule;
	const a: EntryAirtime = { recurrence: s.recurrence };
	const day = s.recurrence === 'weekly' ? s.dayOfWeek : s.recurrence === 'monthly' ? s.dayOfMonth : undefined;
	if (day !== undefined) a.day = day;
	if (s.releaseTime) a.time = s.releaseTime;
	if (e.currentSeason !== undefined) a.season = e.currentSeason;
	if (e.currentEpisode !== undefined) a.episode = e.currentEpisode;
	if (e.lastAcknowledgedDate) a.acknowledged = e.lastAcknowledgedDate;
	return a;
}
