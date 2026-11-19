import { describe, it, expect } from 'vitest';
import { airtimeCardClass, countdownPillClass, type DetailedCountdown } from '../../src/modules/airtime/ui/AirtimeTab';

const cd = (kind: DetailedCountdown['kind'], daysUntil = 0): DetailedCountdown => ({ kind, label: 'x', daysUntil });

describe('airtimeCardClass', () => {
	it('marks aired', () => {
		expect(airtimeCardClass(cd('aired'), false)).toBe('hoard-airtime__card hoard-airtime__card--aired is-aired');
	});
	it('marks due and selected', () => {
		expect(airtimeCardClass(cd('due'), true)).toBe('hoard-airtime__card hoard-airtime__card--aired is-due hoard-list__row--selected');
	});
	it('keeps future plain', () => {
		expect(airtimeCardClass(cd('future', 3), false)).toBe('hoard-airtime__card');
	});
});

describe('countdownPillClass', () => {
	it('tomorrow', () => {
		expect(countdownPillClass(cd('future', 1))).toBe('hoard-airtime__pill hoard-airtime__pill--tomorrow');
	});
	it('days', () => {
		expect(countdownPillClass(cd('future', 3))).toBe('hoard-airtime__pill hoard-airtime__pill--days');
	});
	it('other kinds', () => {
		expect(countdownPillClass(cd('today-before'))).toBe('hoard-airtime__pill hoard-airtime__pill--today-series');
		expect(countdownPillClass(cd('aired'))).toBe('hoard-airtime__pill hoard-airtime__pill--aired');
		expect(countdownPillClass(cd('due'))).toBe('hoard-airtime__pill hoard-airtime__pill--due');
	});
});
