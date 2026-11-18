import { describe, it, expect, vi } from 'vitest';
import { runAirtimeScheduler } from '../src/modules/airtime/services/airtimeScheduler';
import type { AirtimeEntry, AirtimeSchedule } from '../src/shared/domain/types';

function setup(schedule: AirtimeSchedule) {
	const entry = { id: 'e1', titleId: 'TV Show/C', schedule } as AirtimeEntry;
	const notify = vi.fn();
	const refreshAiring = vi.fn(() => Promise.resolve());
	const dataManager = { getAirtimeEntries: () => [entry], getTitle: () => ({ title: 'C' }), refreshAiring } as never;
	const reading = { getBook: () => undefined, getManga: () => undefined };
	const games = { getGame: () => undefined };
	const run = (notified: Set<string>, now: Date) => runAirtimeScheduler(dataManager, reading, games, notify, notified, now);
	return { run, notify, refreshAiring, notified: new Set<string>() };
}

// 2026-10-19 is a Monday (dayOfWeek 1)
const at = (h: number, m: number, day = 19): Date => new Date(2026, 9, day, h, m);

describe('runAirtimeScheduler catch-up', () => {
	it('fires on a later tick when the airing minute was missed', () => {
		const { run, notify, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		run(notified, at(20, 14));
		expect(notify).not.toHaveBeenCalled();
		run(notified, at(20, 47));
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith('C');
	});

	it('fires once per entry and day, and again the next day', () => {
		const { run, notify, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		run(notified, at(20, 15));
		run(notified, at(20, 16));
		run(notified, at(23, 0));
		expect(notify).toHaveBeenCalledTimes(1);
		run(notified, at(20, 30, 20));
		expect(notify).toHaveBeenCalledTimes(2);
	});

	it('skips schedules more than 12 hours in the past', () => {
		const { run, notify, notified } = setup({ recurrence: 'daily', releaseTime: '08:00' });
		run(notified, at(20, 1));
		expect(notify).not.toHaveBeenCalled();
		run(notified, at(20, 0));
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('only fires on the scheduled day', () => {
		const { run, notify, notified } = setup({ recurrence: 'weekly', dayOfWeek: 2, releaseTime: '09:00' });
		run(notified, at(10, 0));
		expect(notify).not.toHaveBeenCalled();
		run(notified, at(10, 0, 20));
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('forces the airing refresh only on the tick that fires', () => {
		const { run, refreshAiring, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		run(notified, at(20, 0));
		run(notified, at(20, 30));
		run(notified, at(20, 31));
		expect(refreshAiring.mock.calls.map((c) => (c as unknown[])[1])).toEqual([false, true, false]);
	});

	it('ignores entries without a release time', () => {
		const { run, notify, notified } = setup({ recurrence: 'daily' });
		run(notified, at(20, 0));
		expect(notify).not.toHaveBeenCalled();
	});
});
