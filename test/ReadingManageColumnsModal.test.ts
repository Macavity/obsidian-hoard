import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { t } from '../src/i18n';
import { ReadingManageColumnsModal } from '../src/ReadingManageColumnsModal';
import { setupReadingDataManager } from './helpers/setupReadingDataManager';
import { tick } from './helpers/common';

const shown = (Notice as unknown as { shown: string[] }).shown;

async function openModal() {
	const r = await setupReadingDataManager({ 'W/Books/A.md': '---\nName: A\nType: book\nCustom Format: x\n---\n' });
	await r.rdm.addColumn('book', { id: 'c1', name: 'Format', type: 'text', options: [] });
	await r.rdm.addColumn('book', { id: 'c2', name: 'Year', type: 'number', options: [] });
	const onChanged = vi.fn();
	const modal = new ReadingManageColumnsModal(r.f.app, { settings: {} } as never, r.rdm, 'book', onChanged);
	(modal as unknown as { build: () => void }).build();
	return { ...r, modal, onChanged, el: modal.contentEl };
}

const nameInputs = (el: HTMLElement): HTMLInputElement[] =>
	Array.from(el.querySelectorAll<HTMLInputElement>('.hoard-editcol-card-name'));

describe('manage columns dialog names', () => {
	beforeEach(() => { shown.length = 0; });

	it('rejects a rename to another column name ignoring case and keeps the old name', async () => {
		const { rdm, el } = await openModal();
		const input = nameInputs(el)[1]!;
		input.value = ' format ';
		input.dispatchEvent(new Event('change'));
		await tick();
		expect(input.value).toBe('Year');
		expect(rdm.getBookColumns().map((c) => c.name)).toEqual(['Format', 'Year']);
		expect(shown).toEqual([t('reading.columns.nameTaken')]);
	});

	it('accepts a case-only rename of the same column and moves the note key', async () => {
		const { rdm, f, el } = await openModal();
		const input = nameInputs(el)[0]!;
		input.value = 'FORMAT';
		input.dispatchEvent(new Event('change'));
		await tick();
		await tick();
		expect(rdm.getBookColumns()[0]?.name).toBe('FORMAT');
		expect(f.files.get('W/Books/A.md')).toContain('Custom FORMAT: x');
		expect(shown).toHaveLength(1); // the "moved in N notes" notice
	});

	it('rejects adding a column that equals an existing name ignoring case', async () => {
		const { rdm, el } = await openModal();
		el.querySelector<HTMLInputElement>('.hoard-reading-add-col-name')!.value = 'YEAR';
		el.querySelector<HTMLButtonElement>('.hoard-reading-add-col-btn')!.click();
		await tick();
		expect(rdm.getBookColumns()).toHaveLength(2);
		expect(shown).toHaveLength(1);
	});

	it('adds a column with a new name', async () => {
		const { rdm, el } = await openModal();
		el.querySelector<HTMLInputElement>('.hoard-reading-add-col-name')!.value = 'Series';
		el.querySelector<HTMLButtonElement>('.hoard-reading-add-col-btn')!.click();
		await tick();
		expect(rdm.getBookColumns().map((c) => c.name)).toEqual(['Format', 'Year', 'Series']);
	});

	it('locks the dialog while a rename runs and re-renders from fresh columns after', async () => {
		const { rdm, f, el } = await openModal();
		let release!: () => void;
		const gate = new Promise<void>((r) => { release = r; });
		const orig = f.app.fileManager.processFrontMatter.bind(f.app.fileManager);
		f.app.fileManager.processFrontMatter = async (...args: Parameters<typeof orig>) => {
			await gate;
			return orig(...args);
		};
		const input = nameInputs(el)[0]!;
		input.value = 'Fmt';
		input.dispatchEvent(new Event('change'));
		await tick(20);
		const controls = () => Array.from(el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('.hoard-reading-manage-cols-list input, .hoard-reading-manage-cols-list select, .hoard-reading-manage-cols-list button'));
		expect(controls().every((c) => c.disabled)).toBe(true);
		// a change that slips through anyway must not be applied
		const select = el.querySelector<HTMLSelectElement>('.hoard-editcol-card-type')!;
		select.value = 'number';
		select.dispatchEvent(new Event('change'));
		await tick(20);
		release();
		await tick();
		await tick();
		expect(rdm.getBookColumns()[0]).toMatchObject({ name: 'Fmt', type: 'text' });
		expect(controls().some((c) => c.disabled)).toBe(false);
		expect(nameInputs(el)[0]!.value).toBe('Fmt');
	});

	it('tells how many notes kept their value when the new name already existed', async () => {
		const { f, el } = await openModal();
		await f.app.vault.create('W/Books/B.md', '---\nName: B\nType: book\nCustom Format: b\nCustom Fmt: keep\n---\n');
		await tick();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const input = nameInputs(el)[0]!;
		input.value = 'Fmt';
		input.dispatchEvent(new Event('change'));
		await tick();
		await tick();
		warn.mockRestore();
		expect(shown).toContain(t('reading.columns.renamed', { count: 1 }));
		expect(shown).toContain(t('reading.columns.renamedSkipped', { count: 1 }));
	});
});
