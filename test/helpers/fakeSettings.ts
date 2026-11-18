import { vi } from 'vitest';

/** A settings service over a plain object: `update` mutates it like the real one, without persisting. */
export function fakeSettings<S extends object>(settings: S) {
	return {
		get: () => settings,
		update: vi.fn((fn: (draft: S) => void) => {
			fn(settings);
			return Promise.resolve();
		}),
	};
}
