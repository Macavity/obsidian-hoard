import { describe, expect, it } from 'vitest';
import { AddCreditModal } from '../src/AddCreditModal';
import type { CreditsField, HoardTitle } from '../src/types';

const title = (over: Partial<HoardTitle>): HoardTitle => ({ id: 'x', title: 'X', ...over }) as HoardTitle;

function open(field: CreditsField, edited: Partial<HoardTitle>, others: Partial<HoardTitle>[]) {
	const editedTitle = title({ id: 'edited', ...edited });
	const plugin = {
		settings: { colorTheme: 'default' },
		dataManager: { getTitles: () => [editedTitle, ...others.map(title)] },
	};
	const modal = new AddCreditModal({} as never, plugin as never, editedTitle, field, () => {});
	modal.open();
	const input = modal.contentEl.querySelector<HTMLInputElement>('.hoard-credit-search-input')!;
	const type = (q: string): void => {
		input.value = q;
		input.dispatchEvent(new Event('input'));
	};
	const rows = (): HTMLElement[] => Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.hoard-credit-result'));
	const names = (): string[] => rows().map((r) => r.querySelector('.hoard-result-title')!.textContent ?? '');
	return { modal, type, rows, names };
}

describe('AddCreditModal results', () => {
	it('shows a hint until something is typed', () => {
		const { modal, type, rows } = open('cast', {}, []);
		expect(modal.contentEl.querySelector('.hoard-credit-results')!.textContent).toBe('Start typing to search names from your other titles.');
		type('   ');
		expect(rows()).toHaveLength(0);
		expect(modal.contentEl.querySelector('.hoard-credit-hint')).not.toBeNull();
	});

	it('leads with an Add row, then ranks names by usage in the edited field, present ones last', () => {
		const { type, names, rows } = open(
			'cast',
			{ cast: ['Chris Pine'] },
			[
				{ cast: ['Chris Pine', 'Christian Bale', 'Chris Aaa'], director: ['Christian Bale'] },
				{ cast: ['Chris Pine', 'Christian Bale', 'Chris Bbb'], director: ['Christopher Nolan'] },
				{ director: ['Christopher Nolan', 'Chris Evans'], cast: ['Chris Evans'] },
			],
		);
		type('chris');
		// "Chris Pine" is on the edited title → last and disabled; cast ties fall to total use, then name
		expect(names()).toEqual([
			'Add "chris"', 'Christian Bale', 'Chris Evans', 'Chris Aaa', 'Chris Bbb', 'Christopher Nolan', 'Chris Pine',
		]);
		expect(rows()[0]!.classList.contains('hoard-credit-result-new')).toBe(true);
		expect(rows()[0]!.querySelector('.hoard-result-meta')!.textContent).toBe('New cast name');
		expect(rows()[1]!.querySelector('.hoard-result-meta')!.textContent).toBe('Cast in 2 titles · Director in 1 title');
		const present = rows()[6]!;
		expect(present.classList.contains('is-disabled')).toBe(true);
		expect(present.querySelector('.hoard-result-meta')!.textContent).toBe('Already on this title');
	});

	it('ranks by the director count when editing directors', () => {
		const { type, names, rows } = open(
			'director', {},
			[
				{ director: ['Sam Mendes'], cast: ['Sam Rockwell'] },
				{ cast: ['Sam Rockwell'], director: ['Sam Raimi', 'Sam Mendes'] },
			],
		);
		type('sam');
		expect(names()).toEqual(['Add "sam"', 'Sam Mendes', 'Sam Raimi', 'Sam Rockwell']);
		expect(rows()[0]!.querySelector('.hoard-result-meta')!.textContent).toBe('New director name');
		expect(rows()[1]!.querySelector('.hoard-result-meta')!.textContent).toBe('Director in 2 titles');
	});

	it('drops the Add row on an exact match and caps the list at twelve names', () => {
		const many = Array.from({ length: 15 }, (_, i) => `Ann ${String(i).padStart(2, '0')}`);
		const { type, names } = open('cast', {}, [{ cast: [...many, 'Ann'] }]);
		type('ann');
		expect(names()).not.toContain('Add "ann"');
		expect(names()).toHaveLength(12);
		type('Ann 03');
		expect(names()).toEqual(['Ann 03']);
	});

	it('stages a clicked suggestion', () => {
		const { type, rows, modal } = open('cast', {}, [{ cast: ['Ann Lee'] }]);
		type('ann');
		rows()[1]!.dispatchEvent(new Event('mousedown', { cancelable: true }));
		expect(modal.contentEl.querySelector('.hoard-credit-staged')!.textContent).toContain('Ann Lee');
	});
});

describe('AddCreditModal keyboard and staged chips', () => {
	const key = (input: HTMLInputElement, k: string): void => {
		input.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
	};
	const chips = (modal: AddCreditModal): string[] =>
		Array.from(modal.contentEl.querySelectorAll('.hoard-credit-chip-name')).map((c) => c.textContent ?? '');

	it('moves the focus with the arrows and stages the focused row on Enter', () => {
		const { modal, type, rows } = open('cast', {}, [{ cast: ['Chris Aaa', 'Chris Bbb'] }]);
		const input = modal.contentEl.querySelector<HTMLInputElement>('.hoard-credit-search-input')!;
		type('chris');
		key(input, 'ArrowDown');
		key(input, 'ArrowDown');
		key(input, 'ArrowDown');
		key(input, 'ArrowUp');
		expect(rows().map((r) => r.classList.contains('hoard-result-item-focused'))).toEqual([false, true, false]);
		key(input, 'Enter');
		expect(chips(modal)).toEqual(['Chris Aaa']);
	});

	it('stages the top row on Enter without a focused row, and ignores keys without results', () => {
		const { modal, type } = open('cast', {}, []);
		const input = modal.contentEl.querySelector<HTMLInputElement>('.hoard-credit-search-input')!;
		key(input, 'ArrowDown');
		key(input, 'Enter');
		expect(chips(modal)).toEqual([]);
		type('Newbie');
		key(input, 'Enter');
		expect(chips(modal)).toEqual(['Newbie']);
	});

	it('removes a staged name through its icon button', () => {
		const { modal, type } = open('cast', {}, []);
		const input = modal.contentEl.querySelector<HTMLInputElement>('.hoard-credit-search-input')!;
		type('Newbie');
		key(input, 'Enter');
		const del = modal.contentEl.querySelector<HTMLButtonElement>('button.hoard-credit-chip-del')!;
		expect(del.classList.contains('hoard-icon-btn--sm')).toBe(true);
		expect(del.getAttribute('data-icon')).toBe('x');
		del.click();
		expect(chips(modal)).toEqual([]);
	});
});
