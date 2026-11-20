import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGamesAddProvider } from '../src/modules/games/ui/gamesAddProvider';
import type { Game } from '../src/modules/games/domain/model';
import type { GameDetailsResult, GameSearchResult } from '../src/shared/api/ApiService';
import type { AddFormContext, AddHit } from '../src/modules/add/exports';
import { t } from '../src/shared/i18n';
import { fakeSettings } from './helpers/fakeSettings';
import { shownNotices } from './helpers/csvWizard';

const NOW = '2026-03-04T05:06:07.000Z';
const STORE_PLACEHOLDER = 'https://store.steampowered.com/...';

const STEAM_ROW: GameSearchResult = {
	source: 'steam', id: 1145360, title: 'Hades', releaseDate: '2020-09-17', coverUrl: '', platforms: ['PC'],
	url: 'https://store.steampowered.com/app/1145360',
};
const STEAM_DETAILS: GameDetailsResult = {
	...STEAM_ROW, developer: 'Supergiant', publisher: 'Supergiant Games', singleplayer: true, coop: false, multiplayer: false,
	storeUrl: 'https://store.steampowered.com/app/1145360',
};

interface Over {
	source?: 'rawg' | 'igdb' | 'steam';
	details?: GameDetailsResult | null;
	stored?: Array<Partial<Game>>;
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

function setup(over: Over = {}) {
	const source = over.source ?? 'steam';
	const api = {
		hasRawgKey: () => source === 'rawg',
		hasIgdbCredentials: () => source === 'igdb',
		searchSteamStore: vi.fn(() => Promise.resolve([STEAM_ROW])),
		searchRawgGames: vi.fn(() => Promise.resolve([{ ...STEAM_ROW, source: 'rawg' as const, id: 7 }])),
		searchIgdbGames: vi.fn(() => Promise.resolve([{ ...STEAM_ROW, source: 'igdb' as const, id: 9 }])),
		getSteamStoreDetails: vi.fn(() => Promise.resolve<GameDetailsResult | null>(over.details === undefined ? STEAM_DETAILS : over.details)),
		getRawgGameDetails: vi.fn(() => Promise.resolve(null)),
		getIgdbGameDetails: vi.fn(() => Promise.resolve(null)),
	};
	const added: Game[] = [];
	const newGroups: Array<Record<string, unknown>> = [];
	const games = {
		getSettings: () => ({
			types: [{ name: 'Action' }, { name: 'Puzzle' }],
			platforms: [{ name: 'PC' }, { name: 'PlayStation 5' }],
			statuses: [{ name: 'Backlog' }, { name: 'Playing' }],
			defaultStatus: 'Backlog',
		}),
		getGames: () => over.stored ?? [],
		getGroups: () => [],
		generateGameId: (title: string) => `g-${title}`,
		generateGroupId: (name: string) => `grp-${name}`,
		addGame: vi.fn((g: Game) => { added.push(structuredClone(g)); return Promise.resolve(); }),
		addGameToGroup: vi.fn(() => Promise.resolve()),
		addGroup: vi.fn((g: Record<string, unknown>) => { newGroups.push(g); return Promise.resolve(); }),
	};
	const settings = fakeSettings({ gamesApiSource: source, priorities: [] });
	const provider = createGamesAddProvider({ settings: settings as never, games: games as never, api: api as never });
	const done = vi.fn();
	const mount = async (query: string, pick: boolean) => {
		const host = document.createElement('div');
		const hit = pick ? (await provider.search('game', query))[0]! : null;
		const ctx: AddFormContext = { kind: 'game', hit, query, target: 'library', back: vi.fn(), done };
		const handle = provider.renderForm(host, ctx);
		const input = (placeholder: string): HTMLInputElement => host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;
		const type = (el: HTMLInputElement, value: string): void => { el.value = value; el.dispatchEvent(new Event('input')); };
		const submit = (): void => host.querySelector<HTMLButtonElement>('.hoard-modal__btn-row .hoard-btn--primary')!.click();
		await settle();
		return { host, handle, input, type, submit };
	};
	return { provider, api, games, added, newGroups, done, mount };
}

beforeEach(() => {
	vi.setSystemTime(NOW);
	shownNotices.length = 0;
});

describe('games add provider', () => {
	it('serves games only, never as Maybe notes', () => {
		const { provider } = setup();
		expect(provider.kinds).toEqual(['game']);
		expect(provider.maybeKinds).toBeUndefined();
	});

	it.each([
		['steam', 'searchSteamStore'],
		['rawg', 'searchRawgGames'],
		['igdb', 'searchIgdbGames'],
	] as const)('game kind searches the effective game source (%s)', async (source, method) => {
		const { provider, api } = setup({ source });
		const hits = await provider.search('game', 'hades');
		expect(api[method]).toHaveBeenCalledWith('hades');
		expect(hits[0]).toMatchObject({ kind: 'game', title: 'Hades', meta: '2020 · PC', fallbackIcon: '🎮' });
		expect(hits[0]!.id).toMatch(new RegExp(`^${source}:`));
	});

	it('marks a hit already in the games library', async () => {
		const { provider } = setup({ stored: [{ title: 'Other', apiSource: 'steam', apiId: '1145360', steamAppId: '1145360' }] });
		expect((await provider.search('game', 'hades'))[0]!.inLibrary).toBe('Games');
	});

	it('picked Steam game fills developer and platforms and saves the Steam id', async () => {
		const { api, added, done, mount } = setup();
		const { input, submit } = await mount('hades', true);
		expect(api.getSteamStoreDetails).toHaveBeenCalledWith(STEAM_ROW);
		expect(input('Developer').value).toBe('Supergiant');
		expect(input('Publisher').value).toBe('Supergiant Games');
		submit();
		await settle();
		expect(added[0]).toMatchObject({
			title: 'Hades', developer: 'Supergiant', platforms: ['PC'], apiSource: 'steam', apiId: '1145360',
			steamAppId: '1145360', singleplayer: true, type: 'Action', status: 'Backlog',
		});
		expect(done).toHaveBeenCalledWith({ kind: 'game', id: 'g-Hades' });
	});

	it('falls back to the search row when the details come back empty', async () => {
		const { added, mount } = setup({ details: null });
		const form = await mount('hades', true);
		expect(form.input('Developer').value).toBe('');
		form.submit();
		await settle();
		expect(added[0]).toMatchObject({
			title: 'Hades', externalLink: 'https://store.steampowered.com/app/1145360', platforms: ['PC'], apiSource: 'steam',
		});
	});

	it('shows nothing from a pick that was left before its details arrived', async () => {
		const { api, mount } = setup();
		let release: (d: GameDetailsResult | null) => void = () => {};
		api.getSteamStoreDetails.mockReturnValueOnce(new Promise((r) => { release = r; }));
		const { host, handle } = await mount('hades', true);
		handle.destroy();
		release(STEAM_DETAILS);
		await settle();
		expect(host.children).toHaveLength(0);
	});

	it('builds the complete game from a manual entry with the configured genre and default status', async () => {
		const { added, mount } = setup();
		const form = await mount('Hades', false);
		form.type(form.input(STORE_PLACEHOLDER), 'https://www.gog.com/game/hades');
		form.submit();
		await settle();
		expect(added).toStrictEqual([{
			id: 'g-Hades', title: 'Hades', developer: '', publisher: '', type: 'Action', status: 'Backlog',
			priority: '', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0,
			achievementsEarned: 0, achievementsTotal: 0, platforms: [], singleplayer: false, coop: false, multiplayer: false,
			coverUrl: '', apiSource: '', apiId: '', steamAppId: '', lastPlayed: null,
			storeUrl: 'https://www.gog.com/game/hades', externalLink: '', vaultPage: '',
			releaseDate: null, dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW,
		}]);
	});

	it('takes the Steam app id from a pasted store link, but prefers the picked one', async () => {
		const manual = setup();
		const a = await manual.mount('Portal', false);
		a.type(a.input(STORE_PLACEHOLDER), ' https://store.steampowered.com/app/620/ ');
		a.submit();
		await settle();
		expect(manual.added[0]).toMatchObject({ steamAppId: '620', storeUrl: 'https://store.steampowered.com/app/620/' });

		const picked = setup();
		const b = await picked.mount('hades', true);
		b.type(b.input(STORE_PLACEHOLDER), 'https://store.steampowered.com/app/620/');
		b.submit();
		await settle();
		expect(picked.added[0]!.steamAppId).toBe('1145360');
	});

	it('refuses an empty title', async () => {
		const { added, mount } = setup();
		const form = await mount('', false);
		form.submit();
		await settle();
		expect(added).toEqual([]);
		expect(shownNotices).toContain('Please enter a game title.');
	});

	it('duplicate game asks before adding', async () => {
		const { added, mount } = setup({ stored: [{ title: 'Hades' }] });
		const form = await mount('hades', false);
		form.submit();
		await settle();
		expect(added).toEqual([]);
		const warning = form.host.querySelector('.hoard-modal__duplicate-warning');
		expect(warning).not.toBeNull();
		warning!.querySelector<HTMLButtonElement>('.hoard-btn--primary')!.click();
		await settle();
		expect(added).toHaveLength(1);
	});

	it('adds the game to a new group', async () => {
		const { newGroups, mount } = setup();
		const form = await mount('Hades', false);
		const groupInput = form.input('New group name...');
		form.type(groupInput, 'Roguelikes');
		form.submit();
		await settle();
		expect(newGroups[0]).toMatchObject({ id: 'grp-Roguelikes', name: 'Roguelikes', gameIds: ['g-Hades'] });
	});

	it('disables the submit button while the game is being saved', async () => {
		const { games, mount, done } = setup();
		let finish!: () => void;
		games.addGame.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
		const form = await mount('Hades', false);
		const button = form.host.querySelector<HTMLButtonElement>('.hoard-modal__btn-row .hoard-btn--primary')!;
		form.submit();
		await settle();
		expect(button.disabled).toBe(true);
		button.click();
		await settle();
		expect(games.addGame).toHaveBeenCalledTimes(1);
		finish();
		await settle();
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('a hit found again after more rows than the cap still opens with its data', async () => {
		const { provider, api } = setup();
		const [first] = await provider.search('game', 'hades');
		const many = Array.from({ length: 600 }, (_, i) => ({ ...STEAM_ROW, id: 5000 + i, title: `Filler ${i}` }));
		api.searchSteamStore.mockResolvedValueOnce(many);
		await provider.search('game', 'filler');
		api.searchSteamStore.mockResolvedValueOnce([STEAM_ROW]);
		await provider.search('game', 'hades');
		api.searchSteamStore.mockResolvedValueOnce(many.slice(0, 450));
		await provider.search('game', 'filler');
		expect(first).toBeDefined();
		const host = document.createElement('div');
		provider.renderForm(host, { kind: 'game', hit: first!, query: 'h', target: 'library', back: () => {}, done: () => {} });
		await settle();
		expect(api.getSteamStoreDetails).toHaveBeenCalled();
		expect(shownNotices).toHaveLength(0);
	});

	it('a hit whose row is gone opens a form seeded from the hit and says so', () => {
		const { provider } = setup();
		const host = document.createElement('div');
		const hit: AddHit = { kind: 'game', id: 'steam:0', title: 'Gone Game', meta: '', thumbUrl: 'https://img.test/g.jpg', fallbackIcon: 'x', inLibrary: null };
		provider.renderForm(host, { kind: 'game', hit, query: 'g', target: 'library', back: () => {}, done: () => {} });
		const values = Array.from(host.querySelectorAll<HTMLInputElement>('input')).map((el) => el.value);
		expect(values).toContain('Gone Game');
		expect(values).toContain('https://img.test/g.jpg');
		expect(shownNotices).toContain(t('add.url.lookupExpired'));
	});
});
