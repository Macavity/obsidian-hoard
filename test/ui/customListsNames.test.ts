import { afterEach, describe, expect, it } from 'vitest';
import { Notice } from 'obsidian';
import { until } from '../helpers/common';
import { makeList, setupCustomLists } from '../helpers/setupCustomLists';

const shown = (Notice as unknown as { shown: string[] }).shown;
const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const key = (el: HTMLElement, k: string): void => {
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true }));
};

afterEach(() => {
	document.body.replaceChildren();
	shown.length = 0;
});

describe('list tab rename', () => {
	const startRename = (container: HTMLElement, idx = 0): HTMLInputElement => {
		qa(container, '.hoard-custom-lists__subtab-name')[idx]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		return q(container, '.hoard-custom-lists__subtab-rename') as HTMLInputElement;
	};

	it('renames the list on Enter and keeps it active', async () => {
		const { container, f } = await setupCustomLists([makeList()]);
		const input = startRename(container);
		input.value = 'Later';
		key(input, 'Enter');
		await until(() => qa(container, '.hoard-custom-lists__subtab-name').some((s) => s.textContent === 'Later'));
		expect([...f.files.keys()].some((p) => p.endsWith('/Later.md'))).toBe(true);
	});

	it('keeps the name on Escape, on an unchanged or empty value, and saves only once', async () => {
		const { container, f } = await setupCustomLists([makeList()]);
		const files = (): string[] => [...f.files.keys()].sort();
		const before = files();
		let input = startRename(container);
		input.value = 'Other';
		key(input, 'Escape');
		input.dispatchEvent(new Event('blur'));
		expect(container.querySelector('.hoard-custom-lists__subtab-rename')).toBeNull();
		input = startRename(container);
		input.value = '  ';
		input.dispatchEvent(new Event('blur'));
		input = startRename(container);
		input.value = 'Backlog';
		key(input, 'Enter');
		await Promise.resolve();
		expect(files()).toEqual(before);
	});

	it('refuses a name another list already has', async () => {
		const { container } = await setupCustomLists([makeList(), makeList({ name: 'Done' })]);
		const input = startRename(container);
		input.value = 'Done';
		key(input, 'Enter');
		await until(() => shown.length > 0);
		expect(shown.at(-1)).toContain('Done');
	});
});

describe('name cell editing', () => {
	async function setup() {
		const ctx = await setupCustomLists([makeList()], [{ id: 'w1', title: 'Alien', type: 'Movie', status: 'Completed' }]);
		const p = ctx.plugin as unknown as Record<string, unknown>;
		p.readingDataManager = { getBooks: () => [{ title: 'Aliens Book', status: 'Reading' }], getMangaList: () => [] };
		p.gameDataManager = { getGames: () => [{ title: 'Alien Isolation', status: 'Playing' }] };
		const nameCell = (): HTMLElement => qa(ctx.container, '.hoard-custom-list-table__tr--body')[0]!.querySelector<HTMLElement>('.hoard-custom-list-table__td--name')!;
		const edit = (): HTMLInputElement => {
			nameCell().click();
			return q(ctx.container, '.hoard-custom-list-table__cell-input') as HTMLInputElement;
		};
		const type = (input: HTMLInputElement, v: string): void => {
			input.value = v;
			input.dispatchEvent(new Event('input'));
		};
		const items = (): HTMLElement[] => qa(document.body, '.hoard-custom-list-table__autofill-dropdown .hoard-search-picker__result-item');
		return { ...ctx, edit, type, items };
	}

	it('suggests library titles and picks the focused one with the arrows and Enter', async () => {
		const { edit, type, items, stored } = await setup();
		const input = edit();
		type(input, 'alien');
		expect(items().map((i) => i.querySelector('.hoard-search-picker__result-title')!.textContent)).toEqual(['Alien', 'Aliens Book', 'Alien Isolation']);
		key(input, 'ArrowDown');
		key(input, 'ArrowDown');
		key(input, 'ArrowDown');
		key(input, 'ArrowDown');
		key(input, 'ArrowUp');
		expect(items().map((i) => i.classList.contains('hoard-search-picker__result-item--focused'))).toEqual([false, true, false]);
		key(input, 'Enter');
		expect(input.value).toBe('Aliens Book');
		expect(items()).toHaveLength(0);
		key(input, 'Enter');
		await until(() => stored('Backlog').rows[0]!.name === 'Aliens Book');
	});

	it('saves on blur and picks a suggestion by mouse', async () => {
		const { edit, type, items, stored } = await setup();
		const input = edit();
		type(input, 'isol');
		items()[0]!.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
		expect(input.value).toBe('Alien Isolation');
		input.dispatchEvent(new Event('blur'));
		input.dispatchEvent(new Event('blur'));
		await until(() => stored('Backlog').rows[0]!.name === 'Alien Isolation');
	});
});
