import { describe, it, expect, vi } from 'vitest';
import { effectiveMediaSource } from '../src/apiSources';
import { LibraryIndex } from '../src/LibraryIndex';
import { resultIdKeys } from '../src/titleSearch';
import type HoardPlugin from '../src/main';
import type { Game, MediaSearchResult } from '../src/types';
import type { GameDetailsResult, GameSearchResult } from '../src/ApiService';
import { AddGameModal } from '../src/AddGameModal';

const row: MediaSearchResult = {
	imdbId: 'tt0903747', title: 'Breaking Bad', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '', url: '', seasons: [],
};

describe('keyless watchlist routing', () => {
	it('keys a Cinemeta row by imdb id even when TMDB is chosen without a key', () => {
		const api = { hasOmdbKey: () => false, hasTmdbKey: () => false } as never;
		const source = effectiveMediaSource({ activeApi: 'TMDB' }, api);
		expect(source).toBe('cinemeta');
		expect(resultIdKeys(row, source)).toEqual(['imdb:tt0903747']);
	});

	it('finds the stored note with that External ID as already in the library', () => {
		const titles = [{ title: 'Other', malId: '', anilistId: '', tmdbId: '', tmdbMediaType: '', externalLink: 'https://www.imdb.com/title/tt0903747/' }];
		const plugin = { dataManager: { getTitles: vi.fn(() => titles) } } as unknown as HoardPlugin;
		const idx = LibraryIndex.build(plugin, ['watchlist']);
		expect(idx.lookup(['imdb:tt0903747'], 'Unrelated')).toBe('Watchlist');
	});
});

describe('Steam pick in AddGameModal', () => {
	const steamRow: GameSearchResult = {
		source: 'steam', id: 1145360, title: 'Hades', releaseDate: '2020-09-17', coverUrl: '', platforms: ['PC'], url: 'https://store.steampowered.com/app/1145360',
	};
	const details: GameDetailsResult = {
		...steamRow, developer: 'Supergiant', publisher: 'Supergiant', singleplayer: true, coop: false, multiplayer: false, storeUrl: '',
	};

	function setup() {
		const added: Game[] = [];
		const api = {
			hasRawgKey: () => false,
			hasIgdbCredentials: () => false,
			searchSteamStore: vi.fn(() => Promise.resolve([steamRow])),
			getSteamStoreDetails: vi.fn(() => Promise.resolve<GameDetailsResult | null>(details)),
		};
		const gameData = {
			getSettings: () => ({ types: [], platforms: [], statuses: [], defaultStatus: '' }),
			getGames: () => [],
			getGroups: () => [],
			generateGameId: () => 'g1',
			addGame: vi.fn((g: Game) => { added.push(g); return Promise.resolve(); }),
		};
		const plugin = { settings: { gamesApiSource: 'rawg', priorities: [] }, apiService: api };
		const modal = new AddGameModal({} as never, plugin as never, gameData as never, () => {});
		modal.open();
		return { modal, api, added };
	}

	it('searches Steam when RAWG has no key and saves steamAppId = apiId', async () => {
		const { modal, api, added } = setup();
		type Internals = { search: (q: string) => Promise<unknown>; selectResult: (r: GameSearchResult, c: () => boolean) => Promise<void>; addGame: () => Promise<void>; noApiMessage: () => string | null };
		const m = modal as unknown as Internals;
		expect(m.noApiMessage()).toBeNull();
		await m.search('hades');
		expect(api.searchSteamStore).toHaveBeenCalledWith('hades');
		await m.selectResult(steamRow, () => true);
		expect(api.getSteamStoreDetails).toHaveBeenCalledWith(steamRow);
		await m.addGame();
		expect(added[0]).toMatchObject({ apiSource: 'steam', apiId: '1145360', steamAppId: '1145360', title: 'Hades' });
	});
});

describe('gamesKeyChip', () => {
	it('shows no key hint for the keyless Steam source', async () => {
		const { gamesKeyChip } = await import('../src/ui/gamesKeyChip');
		expect(gamesKeyChip({ gamesApiSource: 'steam', rawgApiKey: '', igdbClientId: '', igdbClientSecret: '' }).tone).toBe('ok');
	});
});
