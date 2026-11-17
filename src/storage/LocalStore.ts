import type { SecretStore } from './SecretStore';
import type { EntryCache, LocalData } from './storageTypes';
import { isRecord } from './sharedHelpers';
import { migrateNoneMarkers } from './cacheMigration';
import { readCache, readUi } from './readCache';
import { readRecord } from './read';

/** `newer`: data.json from a later plugin version; it is never written by this one. */
/** `watchlog` / `newer`: data.json is kept as is and nothing is saved this session (the caller warns). */
export type LoadResult = { schema: 2 } | { schema: 'newer' } | { schema: 'watchlog' };

export interface DataPlugin {
	loadData(): Promise<unknown>;
	saveData(d: unknown): Promise<void>;
}

/** Which data.json this is: WatchLog's (schema 1, a `titles` list), a later version's, ours, or none we can read. */
function formatOf(raw: unknown): 'watchlog' | 'newer' | 2 | 'empty' {
	if (!isRecord(raw)) return 'empty';
	if (raw.schemaVersion === undefined && Array.isArray(raw.titles)) return 'watchlog';
	if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > 2) return 'newer';
	return raw.schemaVersion === 2 ? 2 : 'empty';
}

const SAVE_DEBOUNCE_MS = 100;
/** Lookup bookkeeping can wait: a bulk run then writes data.json every few seconds, not per title. */
const LAZY_SAVE_MS = 5000;

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
		const format = formatOf(raw);
		if (format === 'watchlog' || format === 'newer') {
			// a WatchLog or newer data.json: Hoard starts empty beside it and never writes over it
			this.writable = false;
			this.data = emptyData();
			return { schema: format };
		}
		this.data = emptyData();
		if (format === 2 && isRecord(raw)) this.read(raw);
		// migrate keys left in data.json by older versions; persist right away so they are gone from disk
		if (this.absorbSecrets()) await this.save();
		return { schema: 2 };
	}

	/** Takes a schema-2 data.json field by field; the legacy `none` markers become checks first. */
	private read(raw: Record<string, unknown>): void {
		const migrated = migrateNoneMarkers(readRecord(raw.cache), new Date().toISOString());
		this.data = {
			...raw,
			schemaVersion: 2,
			settings: readRecord(raw.settings),
			secretsInStorage: raw.secretsInStorage === true ? true : undefined,
			reading: isRecord(raw.reading) ? raw.reading : undefined,
			games: isRecord(raw.games) ? raw.games : undefined,
			cache: readCache(migrated.cache),
			ui: readUi(raw.ui),
		};
		if (migrated.changed) this.queueSave();
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

	/** `lazy`: losing it on a crash only costs a repeated lookup, so the save may wait. */
	setCache(id: string, patch: Partial<EntryCache>, save: 'now' | 'lazy' = 'now'): void {
		this.data.cache[id] = { ...this.data.cache[id], ...patch };
		if (save === 'lazy') this.queueLazySave();
		else this.queueSave();
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
		this.schedule(SAVE_DEBOUNCE_MS);
	}

	/** Saves within LAZY_SAVE_MS; a save already scheduled, sooner or later, stays as it is. */
	private queueLazySave(): void {
		this.dirty = true;
		if (this.timer === null) this.schedule(LAZY_SAVE_MS);
	}

	private schedule(ms: number): void {
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.save();
		}, ms);
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
