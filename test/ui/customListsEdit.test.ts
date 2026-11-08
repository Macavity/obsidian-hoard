import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { until } from '../helpers/common';
import { makeList, setupCustomLists } from '../helpers/setupCustomLists';

const shown = (Notice as unknown as { shown: string[] }).shown;
const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const toolbarButton = (container: HTMLElement, label: string): HTMLElement =>
	qa(container, '.hoard-btn').find((b) => b.textContent === label)!;
const key = (el: HTMLElement, k: string, init: KeyboardEventInit = {}): void => {
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true, ...init }));
};
const cell = (container: HTMLElement, rowIdx: number, col: string): HTMLElement =>
	qa(container, '.hoard-cl-tr-body')[rowIdx]!.querySelector<HTMLElement>(`[data-wl-col="${col}"]`)!;

afterEach(() => {
	document.body.replaceChildren();
	shown.length = 0;
});

describe('inline cell editing', () => {
	it('edits a text cell and saves on Enter', async () => {
		const list = makeList({
			columns: [{ id: 'name', label: 'Name', type: 'text', locked: true }, { id: 'col_1', label: 'Note', type: 'text', bold: true }],
			rows: [{ id: 'row_1', name: 'Alpha', col_1: 'old' }],
		});
		const { container, stored } = await setupCustomLists([list]);
		cell(container, 0, 'col_1').click();
		const input = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		expect(input.value).toBe('old');
		expect(cell(container, 0, 'col_1').classList.contains('hoard-cl-editing')).toBe(true);
		input.value = 'fresh';
		key(input, 'Enter');
		await until(() => stored('Backlog').rows[0]!.col_1 === 'fresh');
		await until(() => cell(container, 0, 'col_1').querySelector('.hoard-cell-bold') !== null);
	});

	it('parses number cells, and clears the value when the input is not a number', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		cell(container, 0, 'col_1').click();
		const input = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		expect(input.type).toBe('number');
		input.value = '7.5';
		input.dispatchEvent(new Event('blur'));
		await until(() => stored('Backlog').rows[0]!.col_1 === 7.5);
		cell(container, 0, 'col_1').click();
		const again = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		again.value = '';
		key(again, 'Enter');
		await until(() => stored('Backlog').rows[0]!.col_1 === undefined);
	});

	it('cancels on Escape without saving', async () => {
		const { container, stored } = await setupCustomLists([makeList()]);
		cell(container, 0, 'col_1').click();
		const input = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		input.value = '99';
		key(input, 'Escape');
		await until(() => cell(container, 0, 'col_1').querySelector('.hoard-cl-cell-input') === null);
		expect(stored('Backlog').rows[0]!.col_1).toBe(5);
		expect(cell(container, 0, 'col_1').textContent).toBe('5');
	});

	it('saves only once when Enter is followed by blur', async () => {
		const { f, container, stored } = await setupCustomLists([makeList()]);
		const listPath = [...f.files.keys()].find((p) => p.endsWith('/Backlog.md'))!;
		const writes: string[] = [];
		const record = (path: string): void => { if (path === listPath) writes.push(path); };
		const process = f.app.vault.process.bind(f.app.vault);
		const modify = f.app.vault.modify.bind(f.app.vault);
		vi.spyOn(f.app.vault, 'process').mockImplementation((file, fn) => { record(file.path); return process(file, fn); });
		vi.spyOn(f.app.vault, 'modify').mockImplementation((file, data) => { record(file.path); return modify(file, data); });
		cell(container, 0, 'col_1').click();
		const input = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		input.value = '8';
		key(input, 'Enter');
		input.value = '9';
		input.dispatchEvent(new Event('blur'));
		await until(() => stored('Backlog').rows[0]!.col_1 === 8);
		// let a stray blur save (the 9) land, if there were one
		await new Promise((r) => setTimeout(r, 50));
		expect(stored('Backlog').rows[0]!.col_1).toBe(8);
		expect(writes).toHaveLength(1);
	});

	it('moves editing to the next cell on Tab', async () => {
		const list = makeList({
			columns: [
				{ id: 'name', label: 'Name', type: 'text', locked: true },
				{ id: 'col_1', label: 'A', type: 'text' },
				{ id: 'col_2', label: 'B', type: 'text' },
			],
			rows: [{ id: 'row_1', name: 'Alpha', col_1: 'a', col_2: 'b' }],
		});
		const { container, stored } = await setupCustomLists([list]);
		cell(container, 0, 'col_1').click();
		const input = q(container, '.hoard-cl-cell-input') as HTMLInputElement;
		input.value = 'a2';
		key(input, 'Tab');
		await until(() => cell(container, 0, 'col_2').classList.contains('hoard-cl-editing'));
		expect(stored('Backlog').rows[0]!.col_1).toBe('a2');
	});

	it('starts an empty text cell with an empty input', async () => {
		const list = makeList({
			columns: [{ id: 'name', label: 'Name', type: 'text', locked: true }, { id: 'col_1', label: 'Note', type: 'text' }],
			rows: [{ id: 'row_1', name: 'Alpha' }],
		});
		const { container } = await setupCustomLists([list]);
		cell(container, 0, 'col_1').click();
		expect((q(container, '.hoard-cl-cell-input') as HTMLInputElement).value).toBe('');
	});
});

describe('table settings: option renames', () => {
	const open = async () => {
		const ctx = await setupCustomLists([makeList()]);
		toolbarButton(ctx.container, 'Table settings').click();
		return ctx;
	};
	const rename = (input: HTMLInputElement, to: string): void => {
		input.value = to;
		input.dispatchEvent(new Event('input'));
	};

	it('composes keystroke renames into one migration of the row cells', async () => {
		const { stored } = await open();
		const input = q(document.body, '.hoard-editcol-card-opt-input') as HTMLInputElement;
		rename(input, 'hap');
		rename(input, 'happier');
		qa(document.body, '.hoard-btn-primary').find((b) => b.textContent === 'Save')!.click();
		await until(() => stored('Backlog').rows[0]!.col_2 === 'happier');
		expect(stored('Backlog').columns.find((c) => c.id === 'col_2')?.options).toEqual(['happier']);
	});

	it('leaves rows alone when the rename is cancelled', async () => {
		const { stored } = await open();
		rename(q(document.body, '.hoard-editcol-card-opt-input') as HTMLInputElement, 'changed');
		qa(document.body, '.hoard-btn').find((b) => b.textContent === 'Cancel')!.click();
		expect(stored('Backlog').rows[0]!.col_2).toBe('happy');
	});

	it('does not touch other rows or values on a renamed-back option', async () => {
		const { stored } = await open();
		const input = q(document.body, '.hoard-editcol-card-opt-input') as HTMLInputElement;
		rename(input, 'x');
		rename(input, 'happy');
		qa(document.body, '.hoard-btn-primary').find((b) => b.textContent === 'Save')!.click();
		await until(() => document.body.querySelector('.hoard-editcols-modal') === null);
		expect(stored('Backlog').rows[0]!.col_2).toBe('happy');
		expect(stored('Backlog').rows[1]!.col_2).toBeUndefined();
	});
});

describe('import from pasted rows', () => {
	const open = async (list = makeList()) => {
		const ctx = await setupCustomLists([list]);
		toolbarButton(ctx.container, 'Import').click();
		const textarea = q(document.body, '.hoard-import-textarea') as HTMLTextAreaElement;
		const paste = (text: string): void => {
			textarea.value = text;
			textarea.dispatchEvent(new Event('input'));
		};
		const addBtn = (): HTMLButtonElement =>
			qa(document.body, '.hoard-modal-btn-row .hoard-btn-primary')[0] as HTMLButtonElement;
		return { ...ctx, paste, addBtn };
	};

	it('prompts to paste and disables Add while empty', async () => {
		const { addBtn } = await open();
		expect(addBtn().disabled).toBe(true);
		expect(q(document.body, '.hoard-import-counts').textContent).toContain('Paste');
	});

	it('appends rows mapped onto name, number and select columns', async () => {
		const { paste, addBtn, stored } = await open();
		paste('Name\tScore\tMood\nGamma\t9\thappy\nDelta\t\t');
		expect(addBtn().disabled).toBe(false);
		expect(q(document.body, '.hoard-import-counts').textContent).toContain('2');
		addBtn().click();
		await until(() => stored('Backlog').rows.length === 4);
		const rows = stored('Backlog').rows;
		expect(rows[2]).toMatchObject({ name: 'Gamma', col_1: 9, col_2: 'happy' });
		expect(rows[3]).toMatchObject({ name: 'Delta' });
		expect(rows[3]!.col_1).toBeUndefined();
		expect(rows.map((r) => r.id)).toEqual(['row_1', 'row_2', 'row_3', 'row_4']);
		expect(shown.at(-1)).toContain('2');
	});

	it('creates trailing text columns, named from the header or by position', async () => {
		const { paste, addBtn, stored } = await open();
		paste('Name\tScore\tMood\tExtra\t\nGamma\t1\thappy\tx\ty');
		expect(q(document.body, '.hoard-import-banner').textContent).toContain('2');
		addBtn().click();
		await until(() => stored('Backlog').columns.length === 5);
		const cols = stored('Backlog').columns;
		expect(cols[3]).toMatchObject({ id: 'col_3', label: 'Extra', type: 'text' });
		expect(cols[4]).toMatchObject({ id: 'col_4', label: 'Column 5', type: 'text' });
		expect(stored('Backlog').rows[2]).toMatchObject({ col_3: 'x', col_4: 'y' });
	});

	it('adds unseen select values as options and warns about it', async () => {
		const { paste, addBtn, stored } = await open();
		paste('Name\tScore\tMood\nGamma\t1\tsad\nDelta\t2\tsad\nEps\t3\thappy');
		expect(qa(document.body, '.hoard-import-banner').some((b) => b.textContent!.includes('sad'))).toBe(true);
		addBtn().click();
		await until(() => stored('Backlog').rows.length === 5);
		expect(stored('Backlog').columns.find((c) => c.id === 'col_2')?.options).toEqual(['happy', 'sad']);
	});

	it('blocks the import when a number column receives text', async () => {
		const { paste, addBtn, stored } = await open();
		paste('Name\tScore\nGamma\tabc');
		expect(addBtn().disabled).toBe(true);
		expect(q(document.body, '.hoard-import-banner-error').textContent).toContain('Score');
		addBtn().click();
		await new Promise((r) => setTimeout(r, 20));
		expect(stored('Backlog').rows).toHaveLength(2);
	});

	it('warns when fewer columns are pasted than the list has', async () => {
		const { paste } = await open();
		paste('Name\nGamma');
		expect(qa(document.body, '.hoard-import-banner').some((b) => b.textContent!.includes('⚠'))).toBe(true);
	});

	it('treats every line as data when the header toggle is off', async () => {
		const { paste, addBtn, stored } = await open();
		const toggle = q(document.body, '.hoard-import-header-checkbox') as HTMLInputElement;
		toggle.checked = false;
		toggle.dispatchEvent(new Event('change'));
		paste('Solo\t4');
		expect(addBtn().disabled).toBe(false);
		addBtn().click();
		await until(() => stored('Backlog').rows.length === 3);
		expect(stored('Backlog').rows[2]).toMatchObject({ name: 'Solo', col_1: 4 });
	});

	it('skips locked columns when mapping positions', async () => {
		const list = makeList({
			columns: [
				{ id: 'name', label: 'Name', type: 'text', locked: true },
				{ id: 'col_1', label: 'Score', type: 'number' },
			],
		});
		const { paste, addBtn, stored } = await open(list);
		paste('Name\tScore\nGamma\t2');
		addBtn().click();
		await until(() => stored('Backlog').rows.length === 3);
		expect(stored('Backlog').rows[2]).toMatchObject({ name: 'Gamma', col_1: 2 });
	});
});
