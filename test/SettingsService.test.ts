import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/modules/settings/services/SettingsService';
import type { HoardPluginSettings } from '../src/modules/settings/exports';
import { DEFAULT_SETTINGS } from '../src/modules/settings/exports/settingsDefaults';

function make(persist: () => Promise<void> = () => Promise.resolve()) {
	const settings: HoardPluginSettings = structuredClone(DEFAULT_SETTINGS);
	const persistSpy = vi.fn(persist);
	const changed = vi.fn();
	const svc = new SettingsService(() => settings, persistSpy, changed);
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

	describe('stage', () => {
		it('applies at once, persists and signals once after the quiet period', async () => {
			vi.useFakeTimers();
			try {
				const { svc, persistSpy, changed } = make();
				svc.stage((s) => { s.omdbApiKey = 'a'; });
				svc.stage((s) => { s.omdbApiKey = 'ab'; });
				expect(svc.get().omdbApiKey).toBe('ab');
				vi.advanceTimersByTime(499);
				expect(persistSpy).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(1);
				expect(persistSpy).toHaveBeenCalledTimes(1);
				expect(changed).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('an update in between covers the staged change, so the timer does not save again', async () => {
			vi.useFakeTimers();
			try {
				const { svc, persistSpy } = make();
				svc.stage((s) => { s.omdbApiKey = 'a'; });
				await svc.update((s) => { s.dateFormat = 'iso'; });
				vi.advanceTimersByTime(1000);
				expect(persistSpy).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	describe('flush', () => {
		it('flush persists a pending stage once', async () => {
			vi.useFakeTimers();
			try {
				const { svc, persistSpy, changed } = make();
				svc.stage((s) => { s.omdbApiKey = 'a'; });
				await svc.flush();
				expect(persistSpy).toHaveBeenCalledTimes(1);
				expect(changed).toHaveBeenCalledTimes(1);
				// the cancelled timer must not save a second time
				await vi.advanceTimersByTimeAsync(1000);
				expect(persistSpy).toHaveBeenCalledTimes(1);
			} finally {
				vi.useRealTimers();
			}
		});

		it('flush without a pending stage does nothing', async () => {
			const { svc, persistSpy, changed } = make();
			await svc.flush();
			expect(persistSpy).not.toHaveBeenCalled();
			expect(changed).not.toHaveBeenCalled();
		});
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
