import { describe, expect, it } from 'vitest';
import search from './fixtures/steamstore-search.json';
import { mapSteamStoreSearch, steamDetailsToGameDetails, steamStoreSearchUrl } from '../src/steamStoreApi';

describe('steam store', () => {
	it('builds the search url', () => {
		expect(steamStoreSearchUrl('hades ii')).toBe('https://store.steampowered.com/api/storesearch/?term=hades%20ii&l=english&cc=US');
	});
	it('maps Hades', () => {
		expect(mapSteamStoreSearch(search).find((r) => r.id === 1145360)).toMatchObject({
			source: 'steam', title: 'Hades', platforms: ['Windows', 'macOS'],
			url: 'https://store.steampowered.com/app/1145360/', releaseDate: '',
		});
	});
	it('drops non-app items and garbage', () => {
		expect(mapSteamStoreSearch(search).some((r) => r.title === 'Hades Bundle')).toBe(false);
		expect(mapSteamStoreSearch({ items: [{ type: 'bundle', id: 1, name: 'b' }] })).toEqual([]);
		expect(mapSteamStoreSearch({ items: [{ type: 'app', id: 'x', name: 'b' }] })).toEqual([]);
		expect(mapSteamStoreSearch(null)).toEqual([]);
	});
	it('combines a row with app details', () => {
		const row = mapSteamStoreSearch(search).find((r) => r.id === 1145360)!;
		const d = steamDetailsToGameDetails(row, { name: 'Hades', developer: 'Supergiant Games', publisher: 'Supergiant Games',
			genres: [], releaseDate: '2020-09-17', coverUrl: '', storeUrl: 'https://store.steampowered.com/app/1145360/',
			singleplayer: true, coop: false, multiplayer: false });
		expect(d).toMatchObject({ source: 'steam', id: 1145360, developer: 'Supergiant Games', releaseDate: '2020-09-17',
			coverUrl: row.coverUrl, singleplayer: true });
	});
});
