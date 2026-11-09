import { describe, expect, it, vi } from 'vitest';
import HoardPlugin from '../src/main';

vi.stubGlobal('activeDocument', document);

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
