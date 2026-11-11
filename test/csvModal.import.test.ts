import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvModal } from '../src/CsvModal';
import type { HoardTitle } from '../src/types';
import { clickByText, clickNext, shownNotices, previewTitles, uploadCsv, valueSelect } from './helpers/csvWizard';

interface Harness {
	modal: CsvModal;
	added: HoardTitle[][];
	settings: { statuses: { name: string }[]; types: { name: string; color?: string }[]; colorTheme: string };
	plugin: { settings: Harness['settings']; saveSettings: ReturnType<typeof vi.fn>; importProgress: unknown };
}

function setup(existing: string[] = []): Harness {
	const added: HoardTitle[][] = [];
	const settings = {
		statuses: [{ name: 'Plan to watch' }, { name: 'Completed' }],
		types: [{ name: 'Anime' }, { name: 'Movie' }],
		colorTheme: 'default',
	};
	const plugin = { settings, saveSettings: vi.fn(() => Promise.resolve()), importProgress: null as unknown };
	const dataManager = {
		getTitles: () => existing.map((title) => ({ title })),
		generateId: (name: string) => `id-${name}`,
		addTitleBatch: (chunk: HoardTitle[]) => { added.push(chunk); return Promise.resolve(); },
		notifyChange: vi.fn(),
	};
	const modal = new CsvModal({} as never, plugin as never, dataManager as never, 'import');
	return { modal, added, settings, plugin };
}

beforeEach(() => { shownNotices.length = 0; });

describe('CsvModal import wizard', () => {
	it('skips the value step when every status and type is known', async () => {
		const { modal } = setup();
		await uploadCsv(modal, 'Title,Type,Status\nDune,Anime,Completed\nHeat,Movie,Plan to watch');
		clickNext(modal);
		expect(previewTitles(modal)).toEqual(['Dune', 'Heat']);
		expect(modal.contentEl.querySelector('.hoard-csv__value-map-select')).toBeNull();
		expect(modal.contentEl.querySelector('.hoard-csv__count')!.textContent).toBe('2 of 2 selected');
	});

	it('maps unknown statuses, types and ratings, then imports with created types', async () => {
		const { modal, added, settings, plugin } = setup(['Dune']);
		await uploadCsv(modal, [
			'Title,Type,Status,Rating',
			'Dune,anime,Finished,Great',
			'Akira,Doku,Finished,Great',
			'Heat,Movie,Plan to watch,3',
		].join('\n'));
		clickNext(modal);

		// one select per distinct unknown value: status "Finished", type "anime" + "Doku", rating "Great"
		const selects = modal.contentEl.querySelectorAll<HTMLSelectElement>('.hoard-csv__value-map-select');
		expect(selects).toHaveLength(4);
		expect(valueSelect(modal, 1).value).toBe('Anime'); // case-insensitive pre-fill of the type
		expect(valueSelect(modal, 2).value).toBe('__create__'); // no match → create
		valueSelect(modal, 0).value = 'Completed';
		valueSelect(modal, 3).value = '4';
		clickByText(modal.contentEl, 'button', 'Preview →');

		expect(previewTitles(modal)).toEqual(['Dune', 'Akira', 'Heat']);
		expect(modal.contentEl.querySelectorAll('.hoard-csv__row--duplicate')).toHaveLength(1);
		expect(modal.contentEl.querySelector('.hoard-csv__count')!.textContent).toBe('2 of 3 selected');

		clickByText(modal.contentEl, 'button', 'Import selected');
		await vi.waitFor(() => expect(added).toHaveLength(1));
		expect(added[0]!.map((e) => [e.title, e.type, e.status, e.rating])).toEqual([
			['Akira', 'Doku', 'Completed', 4],
			['Heat', 'Movie', 'Plan to watch', 3],
		]);
		expect(settings.types.map((x) => x.name)).toEqual(['Anime', 'Movie', 'Doku']);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(shownNotices.at(-1)).toContain('2'));
	});

	it('leaves status, type and rating blank when "leave blank" stays selected', async () => {
		const { modal, added } = setup();
		await uploadCsv(modal, 'Title,Type,Status,Rating\nAkira,Doku,Finished,Great');
		clickNext(modal);
		valueSelect(modal, 1).value = '';
		clickByText(modal.contentEl, 'button', 'Preview →');
		clickByText(modal.contentEl, 'button', 'Import selected');
		await vi.waitFor(() => expect(added).toHaveLength(1));
		const [entry] = added[0]!;
		expect(entry).toMatchObject({ title: 'Akira', type: 'Anime', status: 'Plan to watch', rating: 0 });
	});

	it('lists a repeated unknown value once and ignores blank rows and cells', async () => {
		const { modal } = setup();
		await uploadCsv(modal, 'Title,Type,Status,Rating\nA,,Weird,\n,,,\nB,,Weird,x\nC,,,x');
		clickNext(modal);
		// status "Weird" once, rating "x" once
		expect(modal.contentEl.querySelectorAll('.hoard-csv__value-map-select')).toHaveLength(2);
		clickByText(modal.contentEl, 'button', 'Preview →');
		expect(previewTitles(modal)).toEqual(['A', 'B', 'C']);
	});

	it('back from the preview returns to the value step, or to mapping when there was none', async () => {
		const { modal } = setup();
		await uploadCsv(modal, 'Title,Status\nA,Weird');
		clickNext(modal);
		clickByText(modal.contentEl, 'button', 'Preview →');
		const [stepMapping, stepValues, stepPreview] = Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.hoard-csv__step')).slice(1);
		expect(stepPreview!.style.display).toBe('');
		clickByText(stepPreview!, 'button', '← back');
		expect(stepPreview!.style.display).toBe('none');
		// Weird is mapped to blank → the value map counts as shown
		expect(stepValues!.style.display).toBe('');
		expect(stepMapping!.style.display).toBe('none');

		const plain = setup();
		await uploadCsv(plain.modal, 'Title,Status\nA,Completed');
		clickNext(plain.modal);
		const steps = Array.from(plain.modal.contentEl.querySelectorAll<HTMLElement>('.hoard-csv__step'));
		clickByText(steps[3]!, 'button', '← back');
		expect(steps[1]!.style.display).toBe('');
	});

	it('select none / all and single checkboxes drive the import button', async () => {
		const { modal } = setup();
		await uploadCsv(modal, 'Title\nA\nB');
		clickNext(modal);
		const importBtn = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Import selected')!;
		expect(importBtn.disabled).toBe(false);
		clickByText(modal.contentEl, 'button', 'Select none');
		expect(importBtn.disabled).toBe(true);
		expect(modal.contentEl.querySelector('.hoard-csv__count')!.textContent).toBe('0 of 2 selected');
		const boxes = modal.contentEl.querySelectorAll<HTMLInputElement>('.hoard-csv__list input');
		boxes[1]!.checked = true;
		boxes[1]!.dispatchEvent(new Event('change'));
		expect(importBtn.disabled).toBe(false);
		clickByText(modal.contentEl, 'button', 'Select all');
		expect(modal.contentEl.querySelector('.hoard-csv__count')!.textContent).toBe('2 of 2 selected');
	});

	it('shows progress UI while importing and cancel marks the run as cancelling', async () => {
		const { modal, plugin } = setup();
		await uploadCsv(modal, 'Title\nA');
		clickNext(modal);
		const cancelBtn = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Cancel')!;
		const wrap = modal.contentEl.querySelector<HTMLElement>('.hoard-csv__progress-wrap')!;
		expect(wrap.style.display).toBe('none');
		(modal as unknown as { startImportUi(n: number): void }).startImportUi(5);
		expect(wrap.style.display).toBe('');
		expect(cancelBtn.textContent).toBe('Cancel import');
		expect(modal.contentEl.querySelector('.hoard-csv__progress-text')!.textContent).toBe('0 / 5');
		expect(modal.contentEl.querySelector<HTMLElement>('.hoard-csv__progress-fill')!.style.getPropertyValue('--hoard-csv-progress-width')).toBe('0%');
		cancelBtn.click();
		expect(cancelBtn.disabled).toBe(true);
		expect(cancelBtn.textContent).toBe('Cancelling…');
		expect(plugin.importProgress).toBeNull();
	});

	it('warns when nothing selected is importable', async () => {
		const { modal, added } = setup();
		await uploadCsv(modal, 'Title\nA');
		clickNext(modal);
		clickByText(modal.contentEl, 'button', 'Select none');
		await (modal as unknown as { doImport(): Promise<void> }).doImport();
		expect(shownNotices.at(-1)).toBeDefined();
		expect(added).toHaveLength(0);
	});
});
