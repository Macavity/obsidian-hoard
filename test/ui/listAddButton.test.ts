import { describe, expect, it, vi } from 'vitest';
import { setupListTab } from '../helpers/setupListTab';

describe('ListTab add button', () => {
	it('opens the add wizard on the watchlist kinds and re-renders for a new entry', async () => {
		const { tab, container, modals } = await setupListTab({});
		tab.render();
		container.querySelector<HTMLElement>('.hoard-toolbar__add-btn')!.click();
		expect(modals.openAddWizard).toHaveBeenCalledOnce();
		const opts = modals.openAddWizard.mock.calls[0]![0];
		expect(opts.preferredKinds).toEqual(['anime', 'series', 'movie']);
		expect(opts.target).toBeUndefined();
		const render = vi.spyOn(tab, 'render').mockImplementation(() => {});
		opts.onAdded!({ kind: 'series', id: 'Series/Dark' });
		expect(render).toHaveBeenCalledOnce();
	});
});
