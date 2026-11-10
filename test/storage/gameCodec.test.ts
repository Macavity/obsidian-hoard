import { describe, it, expect } from 'vitest';
import { decodeGame, encodeGame, parsePlaytime } from '../../src/storage/gameCodec';
import { formatTime } from '../../src/types';
import type { Game } from '../../src/types';
import { ALL_PROPERTY_NAMES } from '../../src/storage/properties';

const fullGame = (): Game => ({
	id: 'Games/Hades', title: 'Hades', developer: 'Supergiant', publisher: 'Supergiant', type: 'Roguelike', status: 'Playing',
	priority: 'High', favorite: true, dateFavorited: '2026-02-01T00:00:00Z', wishlist: true, rating: 5, progress: 40,
	playtimeMinutes: 750, achievementsEarned: 10, achievementsTotal: 49, platforms: ['PC'], singleplayer: true, coop: true,
	multiplayer: true, coverUrl: 'https://img.example/h.jpg', apiSource: 'rawg', apiId: '274755', steamAppId: '1145360',
	lastPlayed: '2026-10-01T20:00:00Z', storeUrl: 'https://store.example/h', externalLink: 'https://example.com/h',
	vaultPage: 'Games/Hades.md', releaseDate: '2020-09-17', dateStarted: '2026-01-02', dateFinished: null,
	dateAdded: '2026-01-01T00:00:00Z', dateModified: '2026-01-03T00:00:00Z', groups: ['Indie'],
	airtime: { recurrence: 'once', acknowledged: '2026-10-01' },
});

describe('game codec', () => {
	it('parses playtime losslessly', () => {
		for (const m of [0, 45, 60, 125, 60 * 1234 + 5]) expect(parsePlaytime(formatTime(m))).toBe(m);
		expect(parsePlaytime('abc')).toBeNull();
		expect(parsePlaytime('')).toBeNull();
	});

	it('writes only frozen property names and reads them back', () => {
		const game = fullGame();
		const fm = encodeGame(game);
		for (const key of Object.keys(fm)) expect(ALL_PROPERTY_NAMES).toContain(key);
		expect(fm).toMatchObject({ Name: 'Hades', Cover: game.coverUrl, 'Co-op': true, 'Steam App ID': '1145360', Genre: 'Roguelike', Type: 'game' });
		expect(decodeGame(game.id, fm).entry).toEqual(game);
	});

	it('round-trips a game', () => {
		const fm = { Name: 'Hades', Status: 'Playing', Progress: 40, Playtime: '12h 30m', Achievements: '10/49',
			Platforms: ['PC'], 'External ID': 'rawg:274755', 'Steam App ID': '1145360', 'Last Played': '2026-10-01T20:00:00Z',
			'Date Added': '2026-01-01T00:00:00Z', 'Date Modified': '2026-01-01T00:00:00Z', Type: 'game' };
		const { entry, invalidFields } = decodeGame('Games/Hades', fm);
		expect(invalidFields).toEqual([]);
		expect(entry).toMatchObject({ playtimeMinutes: 750, achievementsEarned: 10, achievementsTotal: 49, apiSource: 'rawg', apiId: '274755', lastPlayed: '2026-10-01T20:00:00Z' });
		expect(encodeGame(entry)).toMatchObject({ Playtime: '12h 30m', Achievements: '10/49', 'External ID': 'rawg:274755', 'Steam App ID': '1145360', 'Last Played': '2026-10-01T20:00:00Z' });
	});

	it('maps steam External ID to apiSource', () => {
		const { entry } = decodeGame('Games/X', { Name: 'X', 'External ID': 'steam:42' });
		expect(entry).toMatchObject({ apiSource: 'steam', apiId: '42' });
		expect(encodeGame(entry)).toMatchObject({ 'External ID': 'steam:42' });
	});

	it('keeps groups, airtime and igdb ids', () => {
		const fm = { Name: 'G', Developer: 'D', Publisher: 'P', Genre: 'RPG', Status: 'Playing', Priority: 'High', Wishlist: true,
			'External ID': 'igdb:1942', Groups: ['A'], 'Airtime Recurrence': 'once', 'Airtime Acknowledged': '2026-10-01',
			Cover: 'c', 'Store URL': 's', 'Date Added': 'x', 'Date Modified': 'y' };
		const { entry } = decodeGame('Games/G', fm);
		expect(entry).toMatchObject({ type: 'RPG', apiSource: 'igdb', apiId: '1942', wishlist: true, groups: ['A'] });
		expect(entry.airtime).toEqual({ recurrence: 'once', acknowledged: '2026-10-01' });
		expect(encodeGame(entry)).toMatchObject({ Genre: 'RPG', Developer: 'D', 'External ID': 'igdb:1942', 'Store URL': 's', Cover: 'c', Priority: 'High', Wishlist: true, Type: 'game' });
	});

	it('flags a bad playtime', () => {
		const { entry, invalidFields } = decodeGame('Games/B', { Name: 'B', Status: 'Playing', Playtime: 'lots', 'Date Added': 'x', 'Date Modified': 'y' });
		expect(invalidFields).toContain('Playtime');
		expect(entry.playtimeMinutes).toBe(0);
	});
});
