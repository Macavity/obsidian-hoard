import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultColumnsModal } from '../../src/modules/custom-lists/ui/CustomListsTab';
import { DEFAULT_SETTINGS } from '../../src/shared/domain/settingsDefaults';
import { qsa } from '../helpers/dom';
import { fakeSettings } from '../helpers/fakeSettings';
import { makeList, setupCustomLists } from '../helpers/setupCustomLists';
import { makeTab, newWorld } from './airtimeTab.harness';

vi.mock('../../src/design-system/VirtualScroller', () => ({
	VirtualScroller: class { addSection(): void {} attach(): void {} detach(): void {} destroy(): void {} },
}));

afterEach(() => {
	document.body.replaceChildren();
});

describe('Upcoming tracker view', () => {
	it('stores the chosen view through the settings service, once', () => {
		const { tab, container, settingsService } = makeTab(newWorld({ view: 'list' }));
		tab.render();
		(container.querySelector('.hoard-view-switch__btn') as HTMLElement).click();
		const cards = qsa(container, '.hoard-view-switch__option-row').find((r) => r.textContent?.includes('Cards'))!;
		cards.click();
		expect(settingsService.update).toHaveBeenCalledOnce();
		expect(settingsService.get().upcomingTrackerView).toBe('cards');
		expect(tab.trackerView).toBe('cards');
	});
});

describe('Custom lists settings access', () => {
	it('stores a dragged tab order through the settings service, once', async () => {
		const { container, settingsService } = await setupCustomLists([makeList({ name: 'Alpha' }), makeList({ name: 'Beta' })]);
		const [alpha, beta] = qsa(container, '.hoard-custom-lists__subtab') as [HTMLElement, HTMLElement];
		beta.dispatchEvent(new Event('dragstart'));
		alpha.dispatchEvent(new Event('drop'));
		expect(settingsService.update).toHaveBeenCalledOnce();
		expect(settingsService.get().customListTabOrder).toEqual(['Beta', 'Alpha']);
	});

	it('hands a row to the injected Add router with the list heading', async () => {
		const { container, openAdd } = await setupCustomLists([makeList()]);
		(container.querySelector('.hoard-custom-list-table__row-action--add') as HTMLElement).click();
		expect(openAdd).toHaveBeenCalledWith({ title: 'Alpha', heading: 'Add title' });
	});

	it('stores the default columns through the settings service, once', async () => {
		const settings = fakeSettings({ ...DEFAULT_SETTINGS });
		const modal = new DefaultColumnsModal({} as never, settings, {} as never, () => {});
		const cols = [{ id: 'c1', label: 'Score', type: 'number' as const }];
		await (modal as unknown as { handleSave(c: typeof cols): Promise<void> }).handleSave(cols);
		expect(settings.update).toHaveBeenCalledOnce();
		expect(settings.get().defaultCustomColumns).toEqual(cols);
	});
});
