import type { DeepReadonly } from '../../../shared/domain/deepReadonly';
import type { HoardPluginSettings } from '../domain/model';

export interface SettingsReader {
	get(): DeepReadonly<HoardPluginSettings>;
}

export interface SettingsWriter {
	/** Mutates the settings (synchronously), persists once, then signals the change once. */
	update(fn: (draft: HoardPluginSettings) => void): Promise<void>;
	/**
	 * For text typed key by key: mutates the settings now, but persists and signals once, after
	 * `STAGE_DELAY_MS` without another `stage` or `update` call.
	 */
	stage(fn: (draft: HoardPluginSettings) => void): void;
}