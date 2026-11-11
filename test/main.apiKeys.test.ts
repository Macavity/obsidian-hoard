import { describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import HoardPlugin from '../src/main';
import { LocalStore } from '../src/storage/LocalStore';
import { SecretStore, shouldShowSecretsNotice } from '../src/storage/SecretStore';
import { createFakeApp } from './fakes/fakeApp';

vi.stubGlobal('activeDocument', document);

const shown = (Notice as unknown as { shown: string[] }).shown;

describe('loadSettings', () => {
	it('pushes keys from data.json into the API service (e.g. after an import)', async () => {
		const reset = vi.fn();
		const api = {
			setJikanEndpoint: vi.fn(), setOmdbKey: vi.fn(), setTmdbKey: vi.fn(), setGoogleBooksKey: vi.fn(),
			setRawgKey: vi.fn(), setIgdbCredentials: vi.fn(), setSteamCredentials: vi.fn(),
		};
		const plugin = Object.create(HoardPlugin.prototype) as Record<string, unknown>;
		Object.assign(plugin, {
			local: { data: { settings: { tmdbApiKey: 'tmdb', steamApiKey: 'steam', steamId: '42', igdbClientId: 'id', igdbClientSecret: 'sec' } } },
			shared: { get: () => ({ settings: {} }) },
			secretStore: { read: () => ({}) },
			apiService: api,
			apiKeys: '\n',
			typeNamesKey: null,
			dataManager: { resetNoKeyChecks: reset },
		});
		await (plugin as unknown as HoardPlugin).loadSettings();
		expect(api.setTmdbKey).toHaveBeenCalledWith('tmdb');
		expect(api.setSteamCredentials).toHaveBeenCalledWith('steam', '42');
		expect(api.setIgdbCredentials).toHaveBeenCalledWith('id', 'sec');
		expect(reset).toHaveBeenCalledTimes(1);
	});
});

describe('secret storage at startup', () => {
	function build(data: unknown) {
		const f = createFakeApp();
		f.plugin.data = data;
		const store = new SecretStore(f.app.secretStorage);
		const local = new LocalStore(f.plugin, store);
		const api = {
			setJikanEndpoint: vi.fn(), setOmdbKey: vi.fn(), setTmdbKey: vi.fn(), setGoogleBooksKey: vi.fn(),
			setRawgKey: vi.fn(), setIgdbCredentials: vi.fn(), setSteamCredentials: vi.fn(),
		};
		const ls = new Map<string, unknown>();
		const plugin = Object.create(HoardPlugin.prototype) as Record<string, unknown>;
		Object.assign(plugin, {
			secretStore: store, local, shared: { get: () => ({ settings: {} }) }, apiService: api,
			apiKeys: '\n', typeNamesKey: null, dataManager: { resetNoKeyChecks: vi.fn() },
			app: { loadLocalStorage: (k: string) => ls.get(k) ?? null, saveLocalStorage: (k: string, v: unknown) => { ls.set(k, v); } },
		});
		return { f, local, api, plugin: plugin as unknown as { loadSettings(): Promise<void>; maybeShowSecretsNotice(): void } };
	}

	it('shows the per-device notice only for a migrated vault with empty storage', () => {
		expect(shouldShowSecretsNotice(true, true, false)).toBe(true);
		for (const args of [[false, true, false], [true, false, false], [true, true, true]] as [boolean, boolean, boolean][])
			expect(shouldShowSecretsNotice(...args)).toBe(false);
	});

	it('migrates a key from data.json into storage and the API service', async () => {
		const { f, local, api, plugin } = build({ schemaVersion: 2, settings: { omdbApiKey: 'O' } });
		await local.load();
		await plugin.loadSettings();
		expect(api.setOmdbKey).toHaveBeenCalledWith('O');
		expect(f.secrets.get('hoard-omdb-api-key')).toBe('O');
		expect(JSON.stringify(f.plugin.data)).not.toContain('omdbApiKey');
	});

	it('shows the notice once for a marker with empty storage', async () => {
		const { local, plugin } = build({ schemaVersion: 2, secretsInStorage: true, settings: {} });
		await local.load();
		shown.length = 0;
		plugin.maybeShowSecretsNotice();
		plugin.maybeShowSecretsNotice();
		expect(shown.filter((m) => m.includes('keychain'))).toHaveLength(1);
	});
});
