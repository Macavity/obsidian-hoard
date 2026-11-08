import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/i18n';
import { formatDaysWithMonths, getDetailedCountdown } from '../../src/AirtimeTab';
import type { AirtimeSchedule } from '../../src/types';

// Wednesday 2026-11-18, 12:00 local
const NOW = new Date(2026, 10, 18, 12, 0, 0);
const TODAY = '2026-11-18';
const WED = 3;

const ago = { kind: 'aired', label: 'Aired', daysUntil: 0 };
const due = { kind: 'due', label: 'Due', daysUntil: 0 };
const todayBefore = { kind: 'today-before', label: 'Today', daysUntil: 0 };
const tomorrow = { kind: 'future', label: 'Tomorrow', daysUntil: 1 };
const future = (days: number) => ({ kind: 'future', label: formatDaysWithMonths(days), daysUntil: days });
const none = { kind: 'future', label: '—', daysUntil: 9999 };

const countdown = (s: AirtimeSchedule, isMovie = false, ack?: string) => getDetailedCountdown(s, isMovie, ack);

beforeEach(() => {
	setLocale('en');
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('getDetailedCountdown once', () => {
	it('is a placeholder without a release date', () => {
		expect(countdown({ recurrence: 'once' })).toEqual(none);
	});

	it('is aired (show) or due (movie) for a past date', () => {
		const s = { recurrence: 'once' as const, releaseDate: '2026-11-17' };
		expect(countdown(s)).toEqual(ago);
		expect(countdown(s, true)).toEqual(due);
	});

	it('treats today without a time as passed', () => {
		const s = { recurrence: 'once' as const, releaseDate: TODAY };
		expect(countdown(s)).toEqual(ago);
		expect(countdown(s, true)).toEqual(due);
	});

	it('compares today against the release time', () => {
		const base = { recurrence: 'once' as const, releaseDate: TODAY };
		expect(countdown({ ...base, releaseTime: '12:00' })).toEqual(ago);
		expect(countdown({ ...base, releaseTime: '11:59' }, true)).toEqual(due);
		expect(countdown({ ...base, releaseTime: '12:01' })).toEqual(todayBefore);
		expect(countdown({ ...base, releaseTime: '13:00' }, true)).toEqual(todayBefore);
	});

	it('counts days for a future date', () => {
		expect(countdown({ recurrence: 'once', releaseDate: '2026-11-19' })).toEqual(tomorrow);
		expect(countdown({ recurrence: 'once', releaseDate: '2026-11-23' })).toEqual(future(5));
	});
});

describe('getDetailedCountdown daily', () => {
	it('is today-before ahead of the time', () => {
		expect(countdown({ recurrence: 'daily', releaseTime: '23:00' })).toEqual(todayBefore);
		expect(countdown({ recurrence: 'daily', releaseTime: '23:00' }, false, TODAY)).toEqual(todayBefore);
	});

	it('is aired once the time passed, tomorrow after a tick', () => {
		expect(countdown({ recurrence: 'daily', releaseTime: '08:00' })).toEqual(ago);
		expect(countdown({ recurrence: 'daily' })).toEqual(ago);
		expect(countdown({ recurrence: 'daily', releaseTime: '08:00' }, false, TODAY)).toEqual(tomorrow);
		expect(countdown({ recurrence: 'daily', releaseTime: '08:00' }, false, '2026-11-17')).toEqual(ago);
	});
});

describe('getDetailedCountdown weekly', () => {
	it('handles the scheduled day', () => {
		expect(countdown({ recurrence: 'weekly', dayOfWeek: WED, releaseTime: '08:00' })).toEqual(ago);
		expect(countdown({ recurrence: 'weekly', dayOfWeek: WED, releaseTime: '20:00' })).toEqual(todayBefore);
	});

	it('jumps a week after a tick on the scheduled day', () => {
		expect(countdown({ recurrence: 'weekly', dayOfWeek: WED, releaseTime: '08:00' }, false, TODAY)).toEqual(future(7));
	});

	it('counts days to another weekday', () => {
		expect(countdown({ recurrence: 'weekly', dayOfWeek: 4 })).toEqual(tomorrow);
		expect(countdown({ recurrence: 'weekly', dayOfWeek: 5 })).toEqual(future(2));
		expect(countdown({ recurrence: 'weekly', dayOfWeek: 0 })).toEqual(future(4));
		expect(countdown({ recurrence: 'weekly', dayOfWeek: 2 })).toEqual(future(6));
	});

	it('is a placeholder without a weekday', () => {
		expect(countdown({ recurrence: 'weekly' })).toEqual(none);
	});
});

describe('getDetailedCountdown monthly', () => {
	it('handles the scheduled day', () => {
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 18, releaseTime: '08:00' })).toEqual(ago);
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 18, releaseTime: '20:00' })).toEqual(todayBefore);
	});

	it('advances to next month after a tick on the scheduled day', () => {
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 18 }, false, TODAY)).toEqual(future(30));
	});

	it('counts days to a later day this month', () => {
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 19 })).toEqual(tomorrow);
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 25 })).toEqual(future(7));
	});

	it('rolls an earlier day over to next month', () => {
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 10 })).toEqual(future(22));
	});

	it('is a placeholder without a day of month', () => {
		expect(countdown({ recurrence: 'monthly' })).toEqual(none);
		expect(countdown({ recurrence: 'monthly', dayOfMonth: 0 })).toEqual(none);
	});
});
