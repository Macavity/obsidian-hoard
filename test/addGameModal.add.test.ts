import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddGameModal } from '../src/AddGameModal';
import type { Game } from '../src/types';

const NOW = '2026-03-04T05:06:07.000Z';

type Form = {
	addGame: () => Promise<void>;
	fieldTitle: string; fieldDeveloper: string; fieldPublisher: string; fieldGenre: string; fieldStatus: string;
	fieldPriority: string; fieldReleaseDate: string; fieldDateStarted: string; fieldStoreUrl: string; fieldLink: string;
	fieldCoverUrl: string; fieldPlatforms: string[]; apiSource: string; apiId: string; steamAppId: string;
	fieldSingleplayer: boolean; fieldCoop: boolean; fieldMultiplayer: boolean;
};

function setup() {
	const added: Game[] = [];
	const gameData = {
		getSettings: () => ({ types: [{ name: 'Action' }], platforms: [{ name: 'PC' }], statuses: [], defaultStatus: 'Backlog' }),
		getGames: () => [],
		getGroups: () => [],
		generateGameId: (title: string) => `g-${title}`,
		addGame: (g: Game) => { added.push(g); return Promise.resolve(); },
	};
	const plugin = { settings: { gamesApiSource: 'rawg', priorities: [] }, apiService: {} };
	const modal = new AddGameModal({} as never, plugin as never, gameData as never, () => {});
	return { form: modal as unknown as Form, added };
}

beforeEach(() => {
	// without fake timers this mocks Date only
	vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('AddGameModal add', () => {
	it('builds the complete game from the form', async () => {
		const { form, added } = setup();
		Object.assign(form, {
			fieldTitle: '  Portal 2 ', fieldDeveloper: ' Valve ', fieldPublisher: ' Valve Corp ', fieldGenre: 'Puzzle', fieldStatus: 'Playing',
			fieldPriority: 'High', fieldReleaseDate: '2011-04-19', fieldDateStarted: '2026-02-01',
			fieldStoreUrl: ' https://store.steampowered.com/app/620/ ', fieldLink: ' https://rawg.io/games/portal-2 ',
			fieldCoverUrl: ' https://img.test/p2.jpg ', fieldPlatforms: ['PC'], apiSource: 'rawg', apiId: '4200',
			fieldSingleplayer: true, fieldCoop: true, fieldMultiplayer: false,
		});
		await form.addGame();
		expect(added).toStrictEqual([{
			id: 'g-Portal 2', title: 'Portal 2', developer: 'Valve', publisher: 'Valve Corp', type: 'Puzzle', status: 'Playing',
			priority: 'High', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0,
			achievementsEarned: 0, achievementsTotal: 0, platforms: ['PC'], singleplayer: true, coop: true, multiplayer: false,
			coverUrl: 'https://img.test/p2.jpg', apiSource: 'rawg', apiId: '4200', steamAppId: '620', lastPlayed: null,
			storeUrl: 'https://store.steampowered.com/app/620/', externalLink: 'https://rawg.io/games/portal-2', vaultPage: '',
			releaseDate: '2011-04-19', dateStarted: '2026-02-01', dateFinished: null, dateAdded: NOW, dateModified: NOW,
		}]);
	});

	it('builds the complete game from a title alone, with the configured genre and default status', async () => {
		const { form, added } = setup();
		form.fieldTitle = 'Hades';
		form.fieldStoreUrl = 'https://www.gog.com/game/hades';
		await form.addGame();
		expect(added).toStrictEqual([{
			id: 'g-Hades', title: 'Hades', developer: '', publisher: '', type: 'Action', status: 'Backlog',
			priority: '', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0,
			achievementsEarned: 0, achievementsTotal: 0, platforms: [], singleplayer: false, coop: false, multiplayer: false,
			coverUrl: '', apiSource: '', apiId: '', steamAppId: '', lastPlayed: null,
			storeUrl: 'https://www.gog.com/game/hades', externalLink: '', vaultPage: '',
			releaseDate: null, dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW,
		}]);
	});

	it('prefers the picked Steam app id over the one in the store link', async () => {
		const { form, added } = setup();
		Object.assign(form, { fieldTitle: 'Hades', steamAppId: '1145360', fieldStoreUrl: 'https://store.steampowered.com/app/620/' });
		await form.addGame();
		expect(added[0]!.steamAppId).toBe('1145360');
	});

	it('does not share the platforms array with the form', async () => {
		const { form, added } = setup();
		const platforms = ['PC'];
		Object.assign(form, { fieldTitle: 'Hades', fieldPlatforms: platforms });
		await form.addGame();
		platforms.push('Switch');
		expect(added[0]!.platforms).toEqual(['PC']);
	});
});
