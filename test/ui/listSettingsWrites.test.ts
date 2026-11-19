import { describe, expect, it, vi } from 'vitest';
import { ROWS_SHELVES } from '../../src/shared/domain/rows';
import { movieNote, setupListTab } from '../helpers/setupListTab';

const q = (root: ParentNode, sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
const qa = (root: ParentNode, sel: string): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(sel));
const files = { 'W/Movie/A.md': movieNote('A') };

describe('ListTab settings access', () => {
	it('writes the live filters through the settings service, once per change', async () => {
		const { tab, settingsService } = await setupListTab(files);
		tab.filterTypeExclude.add('Movie');
		(tab as unknown as { persistFilters(): void }).persistFilters();
		expect(settingsService.update).toHaveBeenCalledOnce();
		expect(settingsService.get().listFilters?.typeExclude).toEqual(['Movie']);
	});

	it('remembers the chosen view through the settings service', async () => {
		const { tab, container, settingsService } = await setupListTab(files, {}, 'list');
		tab.render();
		q(container, '.hoard-view-switch__btn').click();
		const cards = qa(container, '.hoard-view-switch__option-row').find((r) => r.textContent?.includes('Cards'))!;
		cards.click();
		expect(settingsService.update).toHaveBeenCalledOnce();
		expect(settingsService.get().defaultWatchlistView).toBe('rows');
		expect(tab.currentView).toBe('rows');
	});

	it('persists a reordered Rows layout through the settings service', async () => {
		const { tab, container, settingsService } = await setupListTab(files, {}, 'rows');
		tab.render();
		q(container, '.hoard-rows-customize__btn').click();
		const modal = document.querySelector<HTMLElement>('.hoard-rows-customize__list');
		expect(modal).not.toBeNull();
		const moveFirstDown = qa(modal!, '.hoard-rows-customize__move')[1]!;
		moveFirstDown.click();
		expect(settingsService.update).toHaveBeenCalledOnce();
		const ids = settingsService.get().rowsLayout?.map((e) => e.id);
		expect(ids?.slice(0, 2)).toEqual([ROWS_SHELVES[1]!.id, ROWS_SHELVES[0]!.id]);
	});
});

describe('ListTab import progress', () => {
	it('shows the running import and cancels it from the header', async () => {
		const { tab, container, host } = await setupListTab(files);
		const cancel = vi.fn();
		host.importProgress = () => ({ current: 3, total: 8, cancel });
		tab.render();
		expect(q(container, '.hoard-import__header-text').textContent).toBe('3 / 8');
		q(container, '.hoard-import__header-progress button').click();
		expect(cancel).toHaveBeenCalledOnce();
	});

	it('shows no progress bar without a running import', async () => {
		const { tab, container } = await setupListTab(files);
		tab.render();
		expect(container.querySelector('.hoard-import__header-progress')).toBeNull();
	});
});
