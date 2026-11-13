import type { SecretStore } from './SecretStore';
import type { EntryCache, LocalData } from './storageTypes';
import { isRecord } from './sharedHelpers';

/** `newer`: data.json from a later plugin version; it is never written by this one. */
/** `watchlog` / `newer`: data.json is kept as is and nothing is saved this session (the caller warns). */
export type LoadResult = { schema: 2 } | { schema: 'newer' } | { schema: 'watchlog' };

export interface DataPlugin {
	loadData(): Promise<unknown>;
	saveData(d: unknown): Promise<void>;
}

const SAVE_DEBOUNCE_MS = 100;

const emptyData = (): LocalData => ({ schemaVersion: 2, settings: {}, cache: {}, ui: {} });

/**
 * Device-local store behind data.json (settings, cache, UI state).
 * Writes only via plugin.saveData (plugin folder), never into the vault.
 * API keys do not belong here: every save moves them into secret storage first.
 */
export class LocalStore {
	data: LocalData = emptyData();
	private timer: number | null = null;
	private dirty = false;
	// false while data.json holds a WatchLog schema-1 or newer format that must not be overwritten;
	// stays false for the whole session (there is no path back, so a WatchLog file is never lost)
	private writable = true;

	constructor(private readonly plugin: DataPlugin, private readonly secrets?: SecretStore) {}

	async load(): Promise<LoadResult> {
		const raw = await this.plugin.loadData();
		if (isRecord(raw) && raw.schemaVersion === undefined && Array.isArray(raw.titles)) {
			// a WatchLog data.json: Hoard starts empty beside it and never writes over it
			this.writable = false;
			this.data = emptyData();
			return { schema: 'watchlog' };
		}
		if (isRecord(raw) && typeof raw.schemaVersion === 'number' && raw.schemaVersion > 2) {
			this.writable = false;
			this.data = emptyData();
			return { schema: 'newer' };
		}
		if (isRecord(raw) && raw.schemaVersion === 2) {
			const d = raw as unknown as LocalData;
			this.data = { ...d, settings: d.settings ?? {}, cache: d.cache ?? {}, ui: d.ui ?? {} };
		} else {
			this.data = emptyData();
		}
		// migrate keys left in data.json by older versions; persist right away so they are gone from disk
		if (this.absorbSecrets()) await this.save();
		return { schema: 2 };
	}

	/** Records that keys live in secret storage (no-op if already recorded). */
	markSecretsInStorage(): void {
		if (this.data.secretsInStorage) return;
		this.data.secretsInStorage = true;
		this.queueSave();
	}

	/** False while data.json holds a WatchLog schema-1 or newer format that must not be overwritten. */
	get isWritable(): boolean { return this.writable; }

	cacheIds(): string[] {
		return Object.keys(this.data.cache);
	}

	getCache(id: string): EntryCache | undefined {
		return this.data.cache[id];
	}

	setCache(id: string, patch: Partial<EntryCache>): void {
		this.data.cache[id] = { ...this.data.cache[id], ...patch };
		this.queueSave();
	}

	deleteCache(id: string): void {
		if (!(id in this.data.cache)) return;
		delete this.data.cache[id];
		this.queueSave();
	}

	renameCache(from: string, to: string): void {
		const entry = this.data.cache[from];
		if (entry === undefined || from === to) return;
		delete this.data.cache[from];
		this.data.cache[to] = entry;
		this.queueSave();
	}

	queueSave(): void {
		this.dirty = true;
		this.clearTimer();
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.save();
		}, SAVE_DEBOUNCE_MS);
	}

	/** Write pending changes now (onunload). */
	async flush(): Promise<void> {
		this.clearTimer();
		if (this.dirty) await this.save();
	}

	private clearTimer(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private async save(): Promise<void> {
		if (!this.writable) return;
		this.dirty = false;
		// settings can be filled by any path (settings save, restore, import): keys never reach data.json
		this.absorbSecrets();
		await this.plugin.saveData(this.data);
	}

	/**
	 * Moves keys out of settings. The marker tells other devices that keys exist; older versions
	 * wrote every key, empty ones included, so it is set only when storage really holds one.
	 */
	private absorbSecrets(): boolean {
		if (!this.secrets?.absorb(this.data.settings)) return false;
		if (!this.secrets.isEmpty()) this.data.secretsInStorage = true;
		return true;
	}
}
