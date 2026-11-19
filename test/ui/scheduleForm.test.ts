import { describe, it, expect } from 'vitest';
import {
	buildScheduleFromState,
	initialScheduleState,
	isScheduleValid,
	resolveScheduleMode,
	renderScheduleModal,
	type ScheduleFormState,
} from '../../src/shared/ui/ScheduleForm';

const state = (over: Partial<ScheduleFormState> = {}): ScheduleFormState => ({
	mode: 'single', recurrence: 'weekly', releaseDate: '', releaseTime: '', dayOfWeek: 6, dayOfMonth: 1, ...over,
});

describe('isScheduleValid', () => {
	it('needs a date for single releases only', () => {
		expect(isScheduleValid(state())).toBe(false);
		expect(isScheduleValid(state({ releaseDate: '2030-01-01' }))).toBe(true);
		expect(isScheduleValid(state({ mode: 'recurring' }))).toBe(true);
	});
});

describe('buildScheduleFromState', () => {
	it('builds a single release with optional time', () => {
		const s = state({ releaseDate: '2030-01-01', releaseTime: '20:00' });
		expect(buildScheduleFromState(s, true)).toEqual({ recurrence: 'once', releaseDate: '2030-01-01', releaseTime: '20:00' });
		expect(buildScheduleFromState(s, false)).toEqual({ recurrence: 'once', releaseDate: '2030-01-01' });
	});
	it('adds only the field of the active cadence', () => {
		expect(buildScheduleFromState(state({ mode: 'recurring', recurrence: 'weekly', dayOfWeek: 2 }), false))
			.toEqual({ recurrence: 'weekly', dayOfWeek: 2 });
		expect(buildScheduleFromState(state({ mode: 'recurring', recurrence: 'monthly', dayOfMonth: 15 }), false))
			.toEqual({ recurrence: 'monthly', dayOfMonth: 15 });
		expect(buildScheduleFromState(state({ mode: 'recurring', recurrence: 'daily' }), false))
			.toEqual({ recurrence: 'daily' });
	});
});

describe('initialScheduleState', () => {
	it('defaults to weekly on Saturday without a schedule or date', () => {
		expect(initialScheduleState(null, null, 'single')).toEqual(state());
	});
	it('derives the weekday from the item release date', () => {
		const s = initialScheduleState(null, '2030-01-07', 'recurring'); // a Monday
		expect(s.releaseDate).toBe('2030-01-07');
		expect(s.dayOfWeek).toBe(1);
	});
	it('ignores malformed item dates', () => {
		expect(initialScheduleState(null, '07.01.2030', 'single').releaseDate).toBe('');
	});
	it('takes values from an existing schedule', () => {
		const s = initialScheduleState({ recurrence: 'monthly', dayOfMonth: 9, releaseTime: '10:00' }, null, 'recurring');
		expect(s).toMatchObject({ recurrence: 'monthly', dayOfMonth: 9, releaseTime: '10:00' });
	});
});

describe('resolveScheduleMode', () => {
	it('prefers explicit, then the schedule, then the fallback', () => {
		expect(resolveScheduleMode(null, 'recurring', 'single')).toBe('recurring');
		expect(resolveScheduleMode({ recurrence: 'once' }, undefined, 'recurring')).toBe('single');
		expect(resolveScheduleMode({ recurrence: 'daily' }, undefined, 'single')).toBe('recurring');
		expect(resolveScheduleMode(null, undefined, 'single')).toBe('single');
	});
});

describe('renderScheduleModal recurring fields', () => {
	const options = (over: object = {}) => ({
		withTime: true,
		withRecurring: true,
		recurrenceLabel: 'Airs',
		recurrenceOptions: [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'daily', label: 'Daily' }],
		modeLabels: ['Single', 'Recurring'] as [string, string],
		hint: () => 'hint',
		timeNote: (t: string) => `JST ${t}`,
		renderCounters: (p: HTMLElement) => { p.createDiv({ cls: 'counters' }); },
		modal: { close: () => undefined },
		onSave: () => Promise.resolve(),
		...over,
	});

	it('switches the extra field with the cadence', () => {
		const parent = document.createElement('div');
		const st = state({ mode: 'recurring', recurrence: 'weekly' });
		renderScheduleModal(parent, st, options());
		expect(parent.querySelector('.counters')).not.toBeNull();
		expect(parent.querySelectorAll('select')).toHaveLength(2);
		const sel = parent.querySelector('select') as HTMLSelectElement;
		sel.value = 'monthly';
		sel.dispatchEvent(new Event('change'));
		expect(st.recurrence).toBe('monthly');
		expect(parent.querySelectorAll('select')).toHaveLength(1);
		expect(parent.querySelector('input[type=number]')).not.toBeNull();
		sel.value = 'daily';
		sel.dispatchEvent(new Event('change'));
		expect(parent.querySelector('input[type=number]')).toBeNull();
	});

	it('omits the time row without withTime', () => {
		const parent = document.createElement('div');
		renderScheduleModal(parent, state({ mode: 'recurring', recurrence: 'daily' }), options({ withTime: false }));
		expect(parent.querySelector('input[type=time]')).toBeNull();
	});
});
