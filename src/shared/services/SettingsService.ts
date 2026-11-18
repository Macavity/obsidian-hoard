import type { DeepReadonly } from './deepReadonly';
import type { HoardPluginSettings } from './types';

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

const STAGE_DELAY_MS = 500;

export interface SettingsServiceDeps {
	current: () => HoardPluginSettings;
	persist: () => Promise<void>;
	changed: () => void;
}

export class SettingsService implements SettingsReader, SettingsWriter {
	private stageTimer: number | null = null;

	constructor(private readonly deps: SettingsServiceDeps) {}

	get(): DeepReadonly<HoardPluginSettings> {
		return this.deps.current();
	}

	async update(fn: (draft: HoardPluginSettings) => void): Promise<void> {
		fn(this.deps.current());
		// this save covers anything staged before
		this.cancelStaged();
		await this.deps.persist();
		this.deps.changed();
	}

	stage(fn: (draft: HoardPluginSettings) => void): void {
		fn(this.deps.current());
		this.cancelStaged();
		this.stageTimer = window.setTimeout(() => {
			this.stageTimer = null;
			this.update(() => {}).catch((e: unknown) => console.error('[Hoard] could not save settings', e));
		}, STAGE_DELAY_MS);
	}

	/** Saves a pending `stage` now (plugin unload); does nothing when none is pending. */
	async flush(): Promise<void> {
		if (this.stageTimer === null) return;
		await this.update(() => {});
	}

	private cancelStaged(): void {
		if (this.stageTimer === null) return;
		window.clearTimeout(this.stageTimer);
		this.stageTimer = null;
	}
}
