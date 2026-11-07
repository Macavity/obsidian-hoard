import { describe, it, expect, vi } from 'vitest';
import { runAirtimeScheduler } from '../src/airtimeScheduler';
import type { AirtimeEntry, AirtimeSchedule } from '../src/types';

function setup(schedule: AirtimeSchedule) {
	const entry = { id: 'e1', titleId: 'TV Show/C', schedule } as AirtimeEntry;
	const notify = vi.fn();
	const refreshAiring = vi.fn(() => Promise.resolve());
	const deps = {
		dataManager: { getAirtimeEntries: () => [entry], getTitle: () => ({ title: 'C' }), refreshAiring } as never,
		readingDataManager: { getBook: () => undefined, getManga: () => undefined },
		gameDataManager: { getGame: () => undefined },
		notify,
	};
	return { deps, notify, refreshAiring, notified: new Set<string>() };
}

// 2026-10-19 is a Monday (dayOfWeek 1)
const at = (h: number, m: number, day = 19): Date => new Date(2026, 9, day, h, m);

describe('runAirtimeScheduler catch-up', () => {
	it('fires on a later tick when the airing minute was missed', () => {
		const { deps, notify, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		runAirtimeScheduler(deps, notified, at(20, 14));
		expect(notify).not.toHaveBeenCalled();
		runAirtimeScheduler(deps, notified, at(20, 47));
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith('C');
	});

	it('fires once per entry and day, and again the next day', () => {
		const { deps, notify, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		runAirtimeScheduler(deps, notified, at(20, 15));
		runAirtimeScheduler(deps, notified, at(20, 16));
		runAirtimeScheduler(deps, notified, at(23, 0));
		expect(notify).toHaveBeenCalledTimes(1);
		runAirtimeScheduler(deps, notified, at(20, 30, 20));
		expect(notify).toHaveBeenCalledTimes(2);
	});

	it('skips schedules more than 12 hours in the past', () => {
		const { deps, notify, notified } = setup({ recurrence: 'daily', releaseTime: '08:00' });
		runAirtimeScheduler(deps, notified, at(20, 1));
		expect(notify).not.toHaveBeenCalled();
		runAirtimeScheduler(deps, notified, at(20, 0));
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('only fires on the scheduled day', () => {
		const { deps, notify, notified } = setup({ recurrence: 'weekly', dayOfWeek: 2, releaseTime: '09:00' });
		runAirtimeScheduler(deps, notified, at(10, 0));
		expect(notify).not.toHaveBeenCalled();
		runAirtimeScheduler(deps, notified, at(10, 0, 20));
		expect(notify).toHaveBeenCalledTimes(1);
	});

	it('forces the airing refresh only on the tick that fires', () => {
		const { deps, refreshAiring, notified } = setup({ recurrence: 'daily', releaseTime: '20:15' });
		runAirtimeScheduler(deps, notified, at(20, 0));
		runAirtimeScheduler(deps, notified, at(20, 30));
		runAirtimeScheduler(deps, notified, at(20, 31));
		expect(refreshAiring.mock.calls.map((c) => (c as unknown[])[1])).toEqual([false, true, false]);
	});

	it('ignores entries without a release time', () => {
		const { deps, notify, notified } = setup({ recurrence: 'daily' });
		runAirtimeScheduler(deps, notified, at(20, 0));
		expect(notify).not.toHaveBeenCalled();
	});
});
