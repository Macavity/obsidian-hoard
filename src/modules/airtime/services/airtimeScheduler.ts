import type { TitleReader } from '../../watchlist/exports';
import type { AirtimeReader } from '../exports';
import type { ReadingReader } from '../../reading/exports';
import type { GameReader } from '../../games/exports';
import type { AirtimeEntry, AirtimeSchedule } from '../exports';

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * How far back a missed airing minute still notifies. Catches ticks lost to a sleeping machine or
 * a late timer without a burst of stale notices after a long sleep. Only today's airing counts.
 */
const AIRTIME_CATCH_UP_MINUTES = 12 * 60;

/**
 * One scheduler pass: notifies once per entry and day, on the first tick at or after its airing
 * minute (within AIRTIME_CATCH_UP_MINUTES). Never writes a note; recurring watch schedules get their
 * API airing pointer refreshed (forced on the notifying tick, otherwise throttled by refreshAiring).
 */
export function runAirtimeScheduler(
	dataManager: AirtimeReader & Pick<TitleReader, 'getTitle'>,
	readingDataManager: Pick<ReadingReader, 'getBook' | 'getManga'>,
	gameDataManager: Pick<GameReader, 'getGame'>,
	notify: (name: string) => void,
	notified: Set<string>,
	now = new Date(),
): void {
	const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

	for (const entry of dataManager.getAirtimeEntries()) {
		// direct day check avoids the getAirtimeCountdown rollover bug
		const due = isDueNow(entry.schedule.releaseTime, now) && isScheduledForToday(entry.schedule, now);
		// deduplicate: only fire once per entry per day
		const notifKey = `${entry.id}-${today}`;
		const fire = due && !notified.has(notifKey);
		if (isRecurringWatch(entry)) void dataManager.refreshAiring(entry.titleId, fire);
		if (!fire) continue;
		notified.add(notifKey);
		const name = subjectName(entry, dataManager, readingDataManager, gameDataManager);
		if (name !== undefined) notify(name);
	}
}

function isRecurringWatch(entry: AirtimeEntry): boolean {
	return entry.source !== 'reading' && entry.source !== 'game' && entry.schedule.recurrence !== 'once';
}

/** The title of the entry's subject: a watch title, a reading item, or a game. */
function subjectName(
	entry: AirtimeEntry,
	dataManager: Pick<TitleReader, 'getTitle'>,
	readingDataManager: Pick<ReadingReader, 'getBook' | 'getManga'>,
	gameDataManager: Pick<GameReader, 'getGame'>,
): string | undefined {
	if (entry.source === 'game') return gameDataManager.getGame(entry.titleId)?.title;
	if (entry.source === 'reading') {
		const item = (entry.readingKind ?? 'book') === 'book'
			? readingDataManager.getBook(entry.titleId)
			: readingDataManager.getManga(entry.titleId);
		return item?.title;
	}
	return dataManager.getTitle(entry.titleId)?.title;
}

/** True when today's `HH:MM` has passed, at most AIRTIME_CATCH_UP_MINUTES ago. */
function isDueNow(releaseTime: string | undefined, now: Date): boolean {
	const m = /^(\d{1,2}):(\d{2})$/.exec(releaseTime ?? '');
	if (!m) return false;
	const late = now.getHours() * 60 + now.getMinutes() - (Number(m[1]) * 60 + Number(m[2]));
	return late >= 0 && late <= AIRTIME_CATCH_UP_MINUTES;
}

function isScheduledForToday(schedule: AirtimeSchedule, now: Date): boolean {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (schedule.recurrence === 'daily') return true;

	if (schedule.recurrence === 'weekly') {
		return schedule.dayOfWeek === now.getDay();
	}

	if (schedule.recurrence === 'monthly') {
		return now.getDate() === (schedule.dayOfMonth ?? -1);
	}

	if (schedule.recurrence === 'once' && schedule.releaseDate) {
		const rel = new Date(schedule.releaseDate + 'T00:00:00');
		const relDay = new Date(rel.getFullYear(), rel.getMonth(), rel.getDate());
		return relDay.getTime() === today.getTime();
	}

	return false;
}
