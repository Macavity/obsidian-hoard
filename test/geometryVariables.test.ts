import { describe, it, expect } from 'vitest';
import { buildPosterCard, pinCardHeight, type PosterCardSpec } from '../src/PosterCard';
import { openStatusDropdown } from '../src/StatusDropdown';
import { openColorPicker } from '../src/ColorPicker';

const prop = (el: Element | null, name: string): string => (el as HTMLElement).style.getPropertyValue(name);
const ctx = (): { container: HTMLElement; cleanups: (() => void)[] } => ({ container: document.createElement('div'), cleanups: [] });
const spec = (over: Partial<PosterCardSpec> = {}): PosterCardSpec => ({
	title: 'Zelda',
	placeholderColor: '#112233',
	statusLabel: 'Playing',
	typeLabel: 'Game',
	onClick: () => {},
	...over,
});

describe('card height', () => {
	it('pins the card itself', () => {
		const card = buildPosterCard(document.createElement('div'), spec({ cardHeight: 240 }), ctx());
		expect(prop(card, '--hoard-card-pinned-height')).toBe('240px');
		expect(card.classList.contains('hoard-card--pinned')).toBe(true);
	});

	it('pins the cell in text-under mode and leaves the card alone', () => {
		const parent = document.createElement('div');
		const card = buildPosterCard(parent, spec({ cardHeight: 300, textUnder: true }), ctx());
		const cell = parent.querySelector('.hoard-card__cell')!;
		expect(prop(cell, '--hoard-card-pinned-height')).toBe('300px');
		expect(cell.classList.contains('hoard-card__cell--pinned')).toBe(true);
		expect(prop(card, '--hoard-card-pinned-height')).toBe('');
		expect(card.classList.contains('hoard-card--pinned')).toBe(false);
	});

	it('does not pin without a height', () => {
		const card = buildPosterCard(document.createElement('div'), spec(), ctx());
		expect(card.classList.contains('hoard-card--pinned')).toBe(false);
		pinCardHeight(null, card, 10);
		expect(prop(card, '--hoard-card-pinned-height')).toBe('10px');
	});

	it('shows progress as a width variable', () => {
		const card = buildPosterCard(document.createElement('div'), spec({ progressRatio: 0.25 }), ctx());
		expect(prop(card.querySelector('.hoard-card__progress-fill'), '--hoard-card-progress-width')).toBe('25%');
	});
});

describe('popover positions', () => {
	const rect = { top: 10, bottom: 30, left: 40, right: 100, width: 60, height: 20, x: 40, y: 10, toJSON: () => ({}) };
	const anchor = (): HTMLElement => {
		const a = document.createElement('button');
		a.getBoundingClientRect = () => rect;
		return a;
	};

	it('places the status dropdown through variables', () => {
		const container = document.createElement('div');
		openStatusDropdown({ anchor: anchor(), container, options: ['a'], onSelect: () => {} });
		const dropdown = container.querySelector('.hoard-status-dropdown');
		expect(prop(dropdown, '--hoard-status-dropdown-top')).toBe('34px');
		expect(prop(dropdown, '--hoard-status-dropdown-left')).toBe('40px');
	});

	it('places the colour palette through variables', () => {
		const container = document.createElement('div');
		openColorPicker({ anchor: anchor(), container, current: '#112233', allowCustom: true, onPick: () => {} });
		const palette = container.querySelector('.hoard-color-picker__palette');
		expect(prop(palette, '--hoard-color-picker-top')).toBe('34px');
		expect(prop(palette, '--hoard-color-picker-left')).toBe('40px');
	});
});
