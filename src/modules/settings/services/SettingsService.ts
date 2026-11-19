import type { DeepReadonly } from '../../../shared/domain/deepReadonly';
import type { HoardPluginSettings } from '../domain/model';
import type { SettingsReader, SettingsWriter } from './roles';

const STAGE_DELAY_MS = 500;

export class SettingsService implements SettingsReader, SettingsWriter {
	private stageTimer: number | null = null;

	constructor(
		private readonly current: () => HoardPluginSettings,
		private readonly persist: () => Promise<void>,
		private readonly changed: () => void,
	) {}

	get(): DeepReadonly<HoardPluginSettings> {
		return this.current();
	}

	async update(fn: (draft: HoardPluginSettings) => void): Promise<void> {
		fn(this.current());
		// this save covers anything staged before
		this.cancelStaged();
		await this.persist();
		this.changed();
	}

	stage(fn: (draft: HoardPluginSettings) => void): void {
		fn(this.current());
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
