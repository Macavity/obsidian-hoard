import { afterEach, describe, expect, it } from 'vitest';
import { Notice, TFile } from 'obsidian';
import { until } from '../helpers/common';
import { makeList, setupCustomLists } from '../helpers/setupCustomLists';
import { CustomListManager, CustomListsTab } from '../../src/CustomListsTab';

const shown = (Notice as unknown as { shown: string[] }).shown;
const PATH = 'W/CustomLists/Backlog.md';
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const cell = (container: HTMLElement, rowIdx: number, col: string): HTMLElement =>
	qa(container, '.hoard-cl-tr-body')[rowIdx]!.querySelector<HTMLElement>(`[data-wl-col="${col}"]`)!;
const rowNames = (container: HTMLElement): string[] =>
	qa(container, '.hoard-cl-td-name').map((e) => e.textContent ?? '');

/** The file as another device would leave it: one row renamed, one row added. */
function foreignContent(content: string): string {
	return content.replace('"Beta"', '"Beta (synced)"').replace(
		'"rows": [',
		'"rows": [\n    {\n      "id": "row_9",\n      "name": "Gamma"\n    },',
	);
}

function commitCell(container: HTMLElement, rowIdx: number, col: string, value: string): void {
	cell(container, rowIdx, col).click();
	const input = container.querySelector<HTMLInputElement>('.hoard-cl-cell-input')!;
	input.value = value;
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
}

afterEach(() => {
	document.body.replaceChildren();
	shown.length = 0;
});

describe('custom list foreign edits', () => {
	it('keeps a foreign edit made between load and save, reloads and tells the user', async () => {
		const { f, container, stored } = await setupCustomLists([makeList()]);
		// a sync write that the tab has not seen yet (no modify event)
		f.files.set(PATH, foreignContent(f.files.get(PATH)!));

		commitCell(container, 0, 'col_1', '99');

		await until(() => shown.length > 0);
		const rows = stored('Backlog').rows;
		expect(rows.map((r) => r.name)).toEqual(['Gamma', 'Alpha', 'Beta (synced)']);
		expect(rows.find((r) => r.id === 'row_1')!.col_1).toBe(5);
		await until(() => rowNames(container).includes('Gamma'));
	});

	it('reloads an open list when its note changes elsewhere', async () => {
		const { f, container } = await setupCustomLists([makeList()]);
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		await f.app.vault.modify(file, foreignContent(f.files.get(PATH)!));
		await until(() => rowNames(container).includes('Gamma'));
		expect(shown).toEqual([]);
	});

	it('saves normally after the reload', async () => {
		const { f, container, stored } = await setupCustomLists([makeList()]);
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		await f.app.vault.modify(file, foreignContent(f.files.get(PATH)!));
		await until(() => rowNames(container).includes('Gamma'));

		commitCell(container, 1, 'col_1', '7');
		await until(() => stored('Backlog').rows.find((r) => r.id === 'row_1')!.col_1 === 7);
		expect(stored('Backlog').rows.map((r) => r.name)).toContain('Gamma');
		expect(shown).toEqual([]);
	});

	it('does not reload under an open cell editor', async () => {
		const { f, container } = await setupCustomLists([makeList()]);
		cell(container, 0, 'col_1').click();
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		await f.app.vault.modify(file, foreignContent(f.files.get(PATH)!));
		await new Promise((r) => setTimeout(r, 20));
		expect(container.querySelector('.hoard-cl-cell-input')).not.toBeNull();
	});

	it('keeps foreign sections and the notes when saving the table', async () => {
		const { f, container } = await setupCustomLists([makeList({ notes: 'mine' })]);
		const withExtra = `${f.files.get(PATH)!}\n## Extra\nhand-written\n`;
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		await f.app.vault.modify(file, withExtra);
		await new Promise((r) => setTimeout(r, 20));

		commitCell(container, 0, 'col_1', '8');
		await until(() => f.files.get(PATH)!.includes('"col_1": 8'));
		expect(f.files.get(PATH)).toContain('## Extra\nhand-written');
		expect(f.files.get(PATH)).toContain('## Notes\nmine');
	});

	it('does not recreate a list deleted elsewhere', async () => {
		const { f, container } = await setupCustomLists([makeList()]);
		f.files.delete(PATH);
		(f.app.vault as unknown as { getAbstractFileByPath: (p: string) => unknown }).getAbstractFileByPath = () => null;

		commitCell(container, 0, 'col_1', '1');
		await until(() => shown.length > 0);
		expect(f.files.has(PATH)).toBe(false);
	});

	it('stops listening once destroyed', async () => {
		const { f, plugin, dataManager } = await setupCustomLists([makeList()]);
		const container = document.body.appendChild(document.createElement('div'));
		const tab = new CustomListsTab(container, plugin as never, dataManager as never);
		await tab.render();
		tab.destroy();
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		await f.app.vault.modify(file, foreignContent(f.files.get(PATH)!));
		await new Promise((r) => setTimeout(r, 20));
		expect(rowNames(container)).not.toContain('Gamma');
	});
});

describe('CustomListManager notes writes', () => {
	it('refuses to overwrite notes changed elsewhere and keeps them', async () => {
		const { f, plugin } = await setupCustomLists([makeList({ notes: 'old' })]);
		const conflicts: string[] = [];
		const manager = new CustomListManager(f.app, plugin as never, (l) => conflicts.push(l.name));
		const list = (await manager.loadList('Backlog'))!;
		f.files.set(PATH, f.files.get(PATH)!.replace('## Notes\nold', '## Notes\nfrom phone'));

		expect(await manager.saveNotes(list, 'mine')).toBe(false);
		expect(f.files.get(PATH)).toContain('## Notes\nfrom phone');
		expect(conflicts).toEqual(['Backlog']);
	});

	it('writes notes when the note is unchanged and keeps saving afterwards', async () => {
		const { f, plugin } = await setupCustomLists([makeList({ notes: 'old' })]);
		const manager = new CustomListManager(f.app, plugin as never);
		const list = (await manager.loadList('Backlog'))!;

		expect(await manager.saveNotes(list, 'mine')).toBe(true);
		expect(list.notes).toBe('mine');
		list.rows[0]!.col_1 = 1;
		expect(await manager.saveList(list)).toBe(true);
		expect(f.files.get(PATH)).toContain('## Notes\nmine');
	});
});

describe('notes modal', () => {
	it('wraps the selection on Ctrl+B / Ctrl+I and saves through the baseline check', async () => {
		const { f, container } = await setupCustomLists([makeList({ notes: 'x' })]);
		qa(container, '.hoard-btn').find((b) => b.textContent === 'Notes')!.click();
		const ta = document.body.querySelector<HTMLTextAreaElement>('textarea')!;
		ta.value = 'word';
		ta.setSelectionRange(0, 4);
		ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true }));
		ta.setSelectionRange(0, ta.value.length);
		ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', metaKey: true, cancelable: true }));
		ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, cancelable: true }));
		expect(ta.value).toBe('***word***');

		qa(document.body, '.hoard-modal-btn-row .hoard-btn-primary')[0]!.click();
		await until(() => f.files.get(PATH)!.includes('## Notes\n***word***'));
	});
});

describe('review follow-ups', () => {
	it('a half-typed JSON on disk neither spams notices nor blocks later saves', async () => {
		const { f, container, stored } = await setupCustomLists([makeList()]);
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		const good = f.files.get(PATH)!;
		await f.app.vault.modify(file, good.replace('"rows": [', '"rows": [ {'));
		await f.app.vault.modify(file, good.replace('"rows": [', '"rows": [ {"'));
		await new Promise((r) => setTimeout(r, 20));
		await f.app.vault.modify(file, good);
		await new Promise((r) => setTimeout(r, 20));
		expect(shown.length).toBeLessThanOrEqual(1);

		commitCell(container, 0, 'col_1', '42');
		await until(() => stored('Backlog').rows[0]!.col_1 === 42);
	});

	it('shows the list again once a corrupt note is repaired', async () => {
		const { f, container, stored } = await setupCustomLists([makeList()]);
		const file = f.app.vault.getAbstractFileByPath(PATH) as TFile;
		const good = f.files.get(PATH)!;
		f.files.set(PATH, good.replace('"rows": [', '"rows": [ {'));
		commitCell(container, 0, 'col_1', '7'); // refused: the note does not parse
		await until(() => container.querySelector('.hoard-cl-td-name') === null);

		await f.app.vault.modify(file, good);
		await until(() => rowNames(container).includes('Alpha'));
		commitCell(container, 0, 'col_1', '8');
		await until(() => stored('Backlog').rows[0]!.col_1 === 8);
	});

	it('keeps the notes modal open with the typed text when the save is refused', async () => {
		const { f, container } = await setupCustomLists([makeList({ notes: 'x' })]);
		qa(container, '.hoard-btn').find((b) => b.textContent === 'Notes')!.click();
		const ta = document.body.querySelector<HTMLTextAreaElement>('textarea')!;
		f.files.set(PATH, f.files.get(PATH)!.replace('## Notes\nx', '## Notes\nfrom phone'));
		ta.value = 'long prose';
		qa(document.body, '.hoard-modal-btn-row .hoard-btn-primary')[0]!.click();
		await until(() => shown.length > 0);
		expect(document.body.contains(ta)).toBe(true);
		expect(ta.value).toBe('long prose');
		expect(f.files.get(PATH)).toContain('## Notes\nfrom phone');
	});

	it('reports notes saved into a list deleted elsewhere', async () => {
		const { f, plugin } = await setupCustomLists([makeList()]);
		const conflicts: string[] = [];
		const manager = new CustomListManager(f.app, plugin as never, (l) => conflicts.push(l.name));
		const list = (await manager.loadList('Backlog'))!;
		f.files.delete(PATH);
		(f.app.vault as unknown as { getAbstractFileByPath: (p: string) => unknown }).getAbstractFileByPath = () => null;
		expect(await manager.saveNotes(list, 'mine')).toBe(false);
		expect(conflicts).toEqual(['Backlog']);
	});

	it('adds a ## Notes section when the note has none', async () => {
		const { f, plugin } = await setupCustomLists([makeList()]);
		const manager = new CustomListManager(f.app, plugin as never);
		f.files.set(PATH, f.files.get(PATH)!.replace('## Notes\n\n\n', ''));
		const list = (await manager.loadList('Backlog'))!;
		expect(await manager.saveNotes(list, 'mine')).toBe(true);
		expect((await manager.loadList('Backlog'))!.notes).toBe('mine');
	});

});
