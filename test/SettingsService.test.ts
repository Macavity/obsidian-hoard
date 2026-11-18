import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/SettingsService';
import { DEFAULT_SETTINGS, type HoardPluginSettings } from '../src/types';

function make(persist: () => Promise<void> = () => Promise.resolve()) {
	const settings: HoardPluginSettings = structuredClone(DEFAULT_SETTINGS);
	const persistSpy = vi.fn(persist);
	const changed = vi.fn();
	const svc = new SettingsService({ current: () => settings, persist: persistSpy, changed });
	return { svc, persistSpy, changed };
}

describe('SettingsService', () => {
	it('update applies the draft change and persists once', async () => {
		const { svc, persistSpy, changed } = make();
		await svc.update((s) => { s.dateFormat = 'iso'; });
		expect(svc.get().dateFormat).toBe('iso');
		expect(persistSpy).toHaveBeenCalledTimes(1);
		expect(changed).toHaveBeenCalledTimes(1);
	});

	it('persist failure propagates and skips the change signal', async () => {
		const { svc, changed } = make(() => Promise.reject(new Error('disk')));
		await expect(svc.update(() => {})).rejects.toThrow('disk');
		expect(changed).not.toHaveBeenCalled();
	});

	it('get is read-only at compile time', () => {
		const { svc } = make();
		// @ts-expect-error a readonly array is not assignable to a mutable one
		const types: HoardPluginSettings['types'] = svc.get().types;
		expect(types).toBeDefined();
		// @ts-expect-error readonly property
		svc.get().dateFormat = 'iso';
	});
});
