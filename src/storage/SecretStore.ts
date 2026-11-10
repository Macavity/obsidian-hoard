// Moves API keys out of data.json into Obsidian's secret storage under fixed Hoard-owned ids.

export type SecretKey =
	| 'omdbApiKey'
	| 'tmdbApiKey'
	| 'googleBooksApiKey'
	| 'rawgApiKey'
	| 'igdbClientId'
	| 'igdbClientSecret'
	| 'steamApiKey'
	| 'steamId'
	| 'jikanBaseUrl';

/** Setting key -> secret id (lowercase alphanumeric with dashes, as Obsidian requires). */
export const SECRET_SETTINGS: Readonly<Record<SecretKey, string>> = {
	omdbApiKey: 'hoard-omdb-api-key',
	tmdbApiKey: 'hoard-tmdb-api-key',
	googleBooksApiKey: 'hoard-google-books-api-key',
	rawgApiKey: 'hoard-rawg-api-key',
	igdbClientId: 'hoard-igdb-client-id',
	igdbClientSecret: 'hoard-igdb-client-secret',
	steamApiKey: 'hoard-steam-api-key',
	steamId: 'hoard-steam-id',
	jikanBaseUrl: 'hoard-jikan-base-url',
};

export const SECRET_KEYS = Object.keys(SECRET_SETTINGS) as readonly SecretKey[];

/** The slice of `app.secretStorage` Hoard uses. */
export interface SecretBackend {
	getSecret(id: string): string | null;
	setSecret(id: string, secret: string): void;
}

export type SecretValues = Partial<Record<SecretKey, string>>;

export class SecretStore {
	constructor(private readonly backend: SecretBackend) {}

	private get(key: SecretKey): string {
		return this.backend.getSecret(SECRET_SETTINGS[key]) ?? '';
	}

	/** Only keys that hold a non-empty value. */
	read(): SecretValues {
		const out: SecretValues = {};
		for (const key of SECRET_KEYS) {
			const v = this.get(key);
			if (v) out[key] = v;
		}
		return out;
	}

	/**
	 * Writes only values that differ from storage; never logs values. Returns the keys whose
	 * value is not in storage afterwards, so the caller can keep them instead of losing them.
	 */
	write(values: SecretValues): SecretKey[] {
		const failed: SecretKey[] = [];
		for (const key of SECRET_KEYS) {
			const v = values[key];
			if (v === undefined || v === this.get(key)) continue;
			try {
				this.backend.setSecret(SECRET_SETTINGS[key], v);
			} catch {
				// reported below through the read-back
			}
			if (this.get(key) !== v) {
				console.warn(`[Hoard] Could not store secret "${key}".`);
				failed.push(key);
			}
		}
		return failed;
	}

	/**
	 * One-time migration: moves secret keys out of a plain settings record into storage.
	 * Fill-only (existing secrets win); a key leaves the record only once the read-back
	 * confirms it is stored, so a failing storage never loses the value.
	 */
	absorb(record: Record<string, unknown>): boolean {
		let changed = false;
		for (const key of SECRET_KEYS) {
			if (!(key in record)) continue;
			const v = record[key];
			if (typeof v !== 'string' || v === '' || this.get(key) !== '') {
				delete record[key];
				changed = true;
				continue;
			}
			try {
				this.backend.setSecret(SECRET_SETTINGS[key], v);
			} catch {
				console.warn(`[Hoard] Could not migrate secret "${key}" to secret storage.`);
				continue;
			}
			if (this.get(key) === '') {
				console.warn(`[Hoard] Secret "${key}" was not stored; keeping it in settings.`);
				continue;
			}
			delete record[key];
			changed = true;
		}
		return changed;
	}

	isEmpty(): boolean {
		return SECRET_KEYS.every((key) => this.get(key) === '');
	}
}

/** Migrated vault (marker) whose keychain on this device is still empty; shown once per device. */
export function shouldShowSecretsNotice(marker: boolean, storageEmpty: boolean, alreadyShown: boolean): boolean {
	return marker && storageEmpty && !alreadyShown;
}
