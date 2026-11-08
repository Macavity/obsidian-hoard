import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatePicker } from '../../src/DatePicker';
import { setActiveDateFormat } from '../../src/types';

(globalThis as { activeDocument?: Document }).activeDocument = document;

const panel = (): HTMLElement | null => document.body.querySelector<HTMLElement>('.hoard-datepicker-panel');
const qa = (sel: string): HTMLElement[] => Array.from(panel()!.querySelectorAll<HTMLElement>(sel));
const month = (): string => panel()!.querySelector('.hoard-datepicker-month')!.textContent ?? '';

function setup(value: string | null, extra: Partial<Parameters<typeof createDatePicker>[0]> = {}) {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	const onChange = vi.fn();
	const handle = createDatePicker({ parent, value, onChange, ...extra });
	return { handle, onChange, parent };
}

beforeEach(() => setActiveDateFormat('european'));
afterEach(() => {
	document.body.replaceChildren();
	setActiveDateFormat('european');
});

describe('date picker calendar', () => {
	it('opens on the committed month with the selected day marked', () => {
		const { handle } = setup('2024-02-15');
		handle.inputEl.click();
		expect(month()).toContain('2024');
		const days = qa('.hoard-datepicker-day');
		expect(days).toHaveLength(29);
		expect(days.filter((d) => d.classList.contains('is-selected')).map((d) => d.textContent)).toEqual(['15']);
	});

	it('starts weeks on Monday, with leading pads for the first weekday', () => {
		const { handle } = setup('2024-02-15');
		handle.inputEl.click();
		expect(qa('.hoard-datepicker-dow span')[0]!.textContent).toBe('Mon');
		// 1 Feb 2024 is a Thursday: three pads on a Monday-first grid
		expect(qa('.hoard-datepicker-pad')).toHaveLength(3);
	});

	it('starts weeks on Sunday in the American format', () => {
		setActiveDateFormat('american');
		const { handle } = setup('2024-02-15');
		handle.inputEl.click();
		expect(qa('.hoard-datepicker-dow span')[0]!.textContent).toBe('Sun');
		expect(qa('.hoard-datepicker-pad')).toHaveLength(4);
	});

	it('wraps the year when stepping back from January and forward from December', () => {
		const { handle } = setup('2024-01-10');
		handle.inputEl.click();
		const [prev, next] = qa('.hoard-datepicker-nav') as [HTMLElement, HTMLElement];
		prev.click();
		expect(month()).toContain('2023');
		next.click();
		expect(month()).toContain('2024');
		for (let i = 0; i < 12; i++) qa('.hoard-datepicker-nav')[1]!.click();
		expect(month()).toContain('2025');
	});

	it('commits a clicked day, closes the panel and reports the ISO date', () => {
		const { handle, onChange } = setup('2024-02-15');
		handle.inputEl.click();
		qa('.hoard-datepicker-day')[9]!.click();
		expect(onChange).toHaveBeenCalledWith('2024-02-10');
		expect(handle.getValue()).toBe('2024-02-10');
		expect(handle.inputEl.value).toBe('10/02/2024');
		expect(panel()).toBeNull();
	});

	it('commits today and clears through the footer buttons', () => {
		const { handle, onChange } = setup(null);
		handle.inputEl.click();
		const todayBtn = qa('.hoard-datepicker-foot button')[0]!;
		expect(qa('.is-today')).toHaveLength(1);
		todayBtn.click();
		expect(onChange).toHaveBeenLastCalledWith(handle.getValue());
		expect(handle.getValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		handle.inputEl.click();
		qa('.hoard-datepicker-foot button')[1]!.click();
		expect(onChange).toHaveBeenLastCalledWith(null);
		expect(handle.inputEl.value).toBe('');
	});

	it('toggles the panel on a second click on the input and closes on Escape or outside click', async () => {
		const { handle } = setup('2024-02-15');
		handle.inputEl.click();
		expect(panel()).not.toBeNull();
		handle.inputEl.click();
		expect(panel()).toBeNull();
		handle.inputEl.click();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(panel()).toBeNull();
		handle.inputEl.click();
		await new Promise((r) => setTimeout(r, 5));
		document.body.click();
		expect(panel()).toBeNull();
	});

	it('keeps the panel open for clicks inside it and swallows them when asked', async () => {
		const outer = vi.fn();
		document.body.addEventListener('click', outer);
		const { handle } = setup('2024-02-15', { stopClickPropagation: true });
		handle.inputEl.click();
		await new Promise((r) => setTimeout(r, 5));
		panel()!.click();
		expect(panel()).not.toBeNull();
		expect(outer).not.toHaveBeenCalled();
		document.body.removeEventListener('click', outer);
	});

	it('repositions on scroll and closes when the input was removed', () => {
		const { handle, parent } = setup('2024-02-15');
		handle.inputEl.click();
		expect(panel()!.style.getPropertyValue('--hoard-dp-top')).not.toBe('');
		document.dispatchEvent(new Event('scroll'));
		expect(panel()).not.toBeNull();
		parent.remove();
		window.dispatchEvent(new Event('resize'));
		expect(panel()).toBeNull();
	});

	it('flips above the field when there is no room below and clamps to the left edge', () => {
		const { handle } = setup('2024-02-15');
		vi.spyOn(handle.inputEl, 'getBoundingClientRect').mockReturnValue(
			{ top: 700, bottom: 720, left: -50, right: 100, width: 150, height: 20, x: -50, y: 700, toJSON: () => ({}) },
		);
		Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
		handle.inputEl.click();
		const top = parseFloat(panel()!.style.getPropertyValue('--hoard-dp-top'));
		const left = parseFloat(panel()!.style.getPropertyValue('--hoard-dp-left'));
		expect(top).toBeLessThan(700);
		expect(left).toBe(8);
	});

	it('stays below the field when flipping would not fit either', () => {
		const { handle } = setup('2024-02-15');
		vi.spyOn(handle.inputEl, 'getBoundingClientRect').mockReturnValue(
			{ top: 50, bottom: 70, left: 10, right: 100, width: 90, height: 20, x: 10, y: 50, toJSON: () => ({}) },
		);
		Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });
		handle.inputEl.click();
		expect(parseFloat(panel()!.style.getPropertyValue('--hoard-dp-top'))).toBe(74);
	});

	it('opens on today for free-text leftovers without selecting anything', () => {
		const { handle } = setup('Spring 2020');
		expect(handle.inputEl.value).toBe('Spring 2020');
		handle.inputEl.click();
		expect(qa('.is-selected')).toHaveLength(0);
		expect(qa('.is-today')).toHaveLength(1);
	});
});

describe('date picker typed input', () => {
	it('commits valid text and flags invalid text without reporting it', () => {
		const { handle, onChange } = setup('2024-02-15');
		handle.inputEl.value = '01/03/2024';
		handle.inputEl.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith('2024-03-01');
		handle.inputEl.value = 'nonsense';
		handle.inputEl.dispatchEvent(new Event('change'));
		expect(handle.inputEl.classList.contains('hoard-input-error')).toBe(true);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(handle.getValue()).toBe('2024-03-01');
		handle.inputEl.value = '02/03/2024';
		handle.inputEl.dispatchEvent(new Event('change'));
		expect(handle.inputEl.classList.contains('hoard-input-error')).toBe(false);
	});

	it('clears on empty text and commits on Enter', () => {
		const { handle, onChange } = setup('2024-02-15');
		handle.inputEl.click();
		handle.inputEl.value = '';
		handle.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(onChange).toHaveBeenCalledWith(null);
		expect(panel()).toBeNull();
	});

	it('accepts ISO text only when lenient', () => {
		const strict = setup(null);
		strict.handle.inputEl.value = '2024-05-06';
		strict.handle.inputEl.dispatchEvent(new Event('change'));
		expect(strict.onChange).not.toHaveBeenCalled();
		const lenient = setup(null, { lenient: true });
		lenient.handle.inputEl.value = '2024-05-06';
		lenient.handle.inputEl.dispatchEvent(new Event('change'));
		expect(lenient.onChange).toHaveBeenCalledWith('2024-05-06');
	});

	it('sets values programmatically, silently when asked, and ignores non-ISO values', () => {
		const { handle, onChange } = setup(null, { title: 'hint' });
		handle.setValue('2024-07-08');
		expect(onChange).toHaveBeenCalledWith('2024-07-08');
		handle.setValue('2024-07-09', true);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(handle.getValue()).toBe('2024-07-09');
		handle.setValue('garbage');
		expect(handle.getValue()).toBeNull();
		expect(handle.inputEl.title).toBe('hint');
	});

	it('re-renders text and placeholder after a format change, and destroy closes the panel', () => {
		const { handle } = setup('2024-02-15');
		setActiveDateFormat('american');
		handle.refresh();
		expect(handle.inputEl.value).toBe('02/15/2024');
		handle.inputEl.click();
		handle.destroy();
		expect(panel()).toBeNull();
	});
});
