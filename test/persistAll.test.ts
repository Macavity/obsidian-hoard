import { afterEach, describe, expect, it, vi } from 'vitest';
import HoardPlugin from '../src/app/main';
import * as types from '../src/shared/domain/types';
import * as split from '../src/shared/services/settingsSplit';

vi.mock('../src/shared/services/settingsSplit', async (orig) => ({ ...(await orig<typeof import('../src/shared/services/settingsSplit')>()), persistSettings: vi.fn(() => Promise.resolve()) }));
vi.mock('../src/shared/domain/types', async (orig) => ({ ...(await orig<typeof import('../src/shared/domain/types')>()), setActiveDateFormat: vi.fn() }));

interface Private {
	settingsService: { update(fn: (s: { dateFormat: string }) => void): Promise<void> };
	syncTypeNames(): void;
	applyApiKeys(): void;
}

afterEach(() => vi.restoreAllMocks());

describe('settings save', () => {
	it('every update runs all four persist steps', async () => {
		const order: string[] = [];
		vi.spyOn(HoardPlugin.prototype as unknown as Private, 'syncTypeNames').mockImplementation(() => { order.push('syncTypeNames'); });
		vi.spyOn(HoardPlugin.prototype as unknown as Private, 'applyApiKeys').mockImplementation(() => { order.push('applyApiKeys'); });
		vi.mocked(types.setActiveDateFormat).mockImplementation(() => { order.push('setActiveDateFormat'); });
		vi.mocked(split.persistSettings).mockImplementation(() => { order.push('persistSettings'); return Promise.resolve(); });
		const plugin = new (HoardPlugin as unknown as new () => HoardPlugin)() as unknown as Private;
		await plugin.settingsService.update((s) => { s.dateFormat = 'iso'; });
		expect(order).toEqual(['setActiveDateFormat', 'syncTypeNames', 'applyApiKeys', 'persistSettings']);
	});
});
