import type { DeepReadonly } from './deepReadonly';
import type { HoardPluginSettings } from './types';

export interface SettingsReader {
	get(): DeepReadonly<HoardPluginSettings>;
}

export interface SettingsWriter {
	/** Mutates the settings, persists once, then signals the change once. */
	update(fn: (draft: HoardPluginSettings) => void): Promise<void>;
}

export interface SettingsServiceDeps {
	current: () => HoardPluginSettings;
	persist: () => Promise<void>;
	changed: () => void;
}

export class SettingsService implements SettingsReader, SettingsWriter {
	constructor(private readonly deps: SettingsServiceDeps) {}

	get(): DeepReadonly<HoardPluginSettings> {
		return this.deps.current();
	}

	async update(fn: (draft: HoardPluginSettings) => void): Promise<void> {
		fn(this.deps.current());
		await this.deps.persist();
		this.deps.changed();
	}
}
