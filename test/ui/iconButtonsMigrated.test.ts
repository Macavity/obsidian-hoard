import { describe, expect, it, vi } from 'vitest';
import { renderSearchBox } from '../../src/ui/TabToolbar';
import { renderSearchHelpButton } from '../../src/SearchHelpModal';
import { renderActionBar } from '../../src/ui/ActionBar';
import { createDatePicker } from '../../src/DatePicker';

(globalThis as { activeDocument?: Document }).activeDocument = document;

describe('migrated icon buttons', () => {
	it('search clear is a hoard-icon-btn with the x icon and clears on click', () => {
		const parent = document.createElement('div');
		const onChange = vi.fn();
		const onCommit = vi.fn();
		const input = renderSearchBox(parent, { value: 'abc', placeholder: 'p', onChange, onCommit });
		const clear = parent.querySelector<HTMLButtonElement>('button.hoard-search-clear')!;
		expect(clear.classList.contains('hoard-icon-btn')).toBe(true);
		expect(clear.getAttribute('data-icon')).toBe('x');
		expect(clear.getAttribute('aria-label')).toBeTruthy();
		clear.click();
		expect(input.value).toBe('');
		expect(onChange).toHaveBeenCalledWith('');
		expect(onCommit).toHaveBeenCalled();
	});

	it('search help button carries the help-circle icon', () => {
		const wrap = document.createElement('div');
		const btn = renderSearchHelpButton(wrap, {} as never, 'Tab', () => []);
		expect(btn.classList.contains('hoard-icon-btn')).toBe(true);
		expect(btn.getAttribute('data-icon')).toBe('help-circle');
	});

	it('selection action bar delete is an x icon button', () => {
		const parent = document.createElement('div');
		const bar = renderActionBar(parent, {} as never, { title: 'Delete', selected: new Set(['a']), message: () => 'm', onConfirm: () => Promise.resolve() });
		const btn = bar.querySelector<HTMLButtonElement>('button.hoard-group-action-btn-delete')!;
		expect(btn.classList.contains('hoard-icon-btn')).toBe(true);
		expect(btn.getAttribute('data-icon')).toBe('x');
		expect(btn.getAttribute('aria-label')).toBe('Delete');
	});

	it('date picker month arrows are chevron icon buttons', () => {
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		const handle = createDatePicker({ parent, value: '2024-02-15', onChange: vi.fn() });
		handle.inputEl.click();
		const navs = Array.from(document.body.querySelectorAll<HTMLElement>('button.hoard-datepicker-nav'));
		expect(navs.map((n) => n.getAttribute('data-icon'))).toEqual(['chevron-left', 'chevron-right']);
		expect(navs.every((n) => n.classList.contains('hoard-icon-btn'))).toBe(true);
		document.body.replaceChildren();
	});
});
