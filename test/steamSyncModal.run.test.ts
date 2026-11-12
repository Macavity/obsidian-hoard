import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SteamSyncModal } from '../src/SteamSyncModal';
import type { SteamOwnedGame } from '../src/ApiService';
import { steamLibraryCover } from '../src/steamStoreApi';
import { GAME_AUTO_STATUS, type Game, type SteamSyncUpdate } from '../src/types';
import { clickByText, shownNotices } from './helpers/csvWizard';

type Details = Awaited<ReturnType<import('../src/ApiService').ApiService['getSteamAppDetails']>>;
type Achievements = { earned: number; total: number } | null;

const owned = (appId: string, name: string, playtimeMinutes = 0): SteamOwnedGame =>
	({ appId, name, playtimeMinutes, lastPlayed: null });

const portalDetails: Details = {
	name: 'Portal (store)', developer: 'Valve', publisher: 'Valve', genres: ['rpg'], releaseDate: '2007-10-10',
	coverUrl: 'https://img.test/portal.jpg', storeUrl: 'https://store.test/portal', singleplayer: true, coop: true, multiplayer: false,
};

interface Opts {
	library?: SteamOwnedGame[];
	games?: Partial<Game>[];
	statuses?: { name: string }[];
	types?: { name: string }[];
	details?: Record<string, Details>;
	achievements?: Achievements;
	onAchievements?: () => void;
}

function setup(opts: Opts = {}) {
	const updates: SteamSyncUpdate[] = [];
	const added: Game[] = [];
	const settings = {
		statuses: opts.statuses ?? [{ name: GAME_AUTO_STATUS }, { name: 'Backlog' }],
		types: opts.types ?? [{ name: 'Action' }, { name: 'RPG' }],
	};
	const plugin = {
		settings: { colorTheme: 'default' },
		apiService: {
			getSteamOwnedGames: () => Promise.resolve({ ok: true, games: opts.library ?? [] }),
			getSteamAchievements: () => { opts.onAchievements?.(); return Promise.resolve(opts.achievements ?? { earned: 3, total: 10 }); },
			getSteamAppDetails: (id: string) => Promise.resolve(opts.details?.[id] ?? null),
		},
	};
	const gameData = {
		getGames: () => (opts.games ?? []).map((g) => ({ steamAppId: '', storeUrl: '', ...g })) as Game[],
		getSettings: () => settings,
		generateGameId: (title: string) => `g-${title}`,
		applySteamSync: (u: SteamSyncUpdate[]) => { updates.push(...u); return Promise.resolve(u.length); },
		addGame: (g: Game) => { added.push(g); return Promise.resolve(); },
	};
	const modal = new SteamSyncModal({} as never, plugin as never, gameData as never);
	return { modal, updates, added };
}

async function openPlan(modal: SteamSyncModal): Promise<void> {
	modal.open();
	await vi.waitFor(() => expect(modal.contentEl.querySelector('.hoard-steam-sync__summary')).not.toBeNull());
}

const status = (m: SteamSyncModal): string => m.contentEl.querySelector('.hoard-steam-sync__status')!.textContent ?? '';

beforeEach(() => { shownNotices.length = 0; });

describe('SteamSyncModal run', () => {
	it('updates matched games and imports ticked new ones with achievements', async () => {
		const { modal, updates, added } = setup({
			library: [owned('10', 'Half-Life', 600), owned('20', 'Portal', 120), owned('30', '', 0), owned('40', 'Skipped', 5)],
			games: [{ id: 'hl', title: 'Half-Life', steamAppId: '10' }],
			details: { '20': portalDetails },
		});
		await openPlan(modal);
		// unmatched rows are listed by playtime; only ticked ones import
		const boxes = modal.contentEl.querySelectorAll<HTMLInputElement>('.hoard-steam-sync__row input');
		expect(boxes).toHaveLength(3);
		for (const b of [boxes[0]!, boxes[2]!]) { b.checked = true; b.dispatchEvent(new Event('change')); }
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(status(modal)).toBe('1 game updated · 2 imported'));

		expect(updates).toEqual([{ gameId: 'hl', steamAppId: '10', playtimeMinutes: 600, lastPlayed: null, achievements: { earned: 3, total: 10 } }]);
		expect(added).toHaveLength(2);
		const [portal, noDetails] = added; // Portal and the nameless app 30; "Skipped" stays unticked
		expect(portal).toMatchObject({
			id: 'g-Portal (store)', title: 'Portal (store)', developer: 'Valve', type: 'rpg', status: 'Backlog',
			playtimeMinutes: 120, achievementsEarned: 3, achievementsTotal: 10, steamAppId: '20',
			coverUrl: 'https://img.test/portal.jpg', storeUrl: 'https://store.test/portal', releaseDate: '2007-10-10',
			singleplayer: true, coop: true, multiplayer: false,
		});
		// a delisted app falls back to the library data alone
		expect(noDetails).toMatchObject({
			title: 'App 30', developer: '', type: 'Action', status: 'Backlog',
			coverUrl: steamLibraryCover('30'), storeUrl: 'https://store.steampowered.com/app/30/', releaseDate: null,
			singleplayer: false,
		});
		expect(shownNotices.at(-1)).toBe('Steam sync: 1 updated, 2 imported.');
		expect(modal.contentEl.querySelector('h2')!.textContent).toBe('Sync complete');
	});

	it('skips achievements when the option is switched off', async () => {
		const { modal, updates, added } = setup({
			library: [owned('10', 'Half-Life', 5), owned('20', 'Portal')],
			games: [{ id: 'hl', title: 'half-life™' }],
			details: { '20': { ...portalDetails, genres: ['Puzzle'] } },
			onAchievements: () => { throw new Error('achievements requested'); },
		});
		await openPlan(modal);
		// title tier of the match: trademark noise and case are ignored
		const achBox = modal.contentEl.querySelector<HTMLInputElement>('.hoard-steam-sync__option input')!;
		achBox.checked = false;
		achBox.dispatchEvent(new Event('change'));
		clickByText(modal.contentEl, 'button', 'All');
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(status(modal)).toBe('1 game updated · 1 imported'));
		expect(updates[0]).toMatchObject({ gameId: 'hl', achievements: null });
		// no configured genre matches "Puzzle" → the first configured one
		expect(added[0]).toMatchObject({ type: 'Action', achievementsEarned: 0, achievementsTotal: 0 });
	});

	it('uses the first status and an empty genre when nothing else is configured', async () => {
		const { modal, added } = setup({
			library: [owned('20', 'Portal')],
			statuses: [{ name: GAME_AUTO_STATUS }],
			types: [],
			details: { '20': { ...portalDetails, name: '' } },
		});
		await openPlan(modal);
		clickByText(modal.contentEl, 'button', 'All');
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(added).toHaveLength(1));
		expect(added[0]).toMatchObject({ title: 'Portal', type: '', status: GAME_AUTO_STATUS });
	});

	it('Cancel finishes the current request, then reports a stopped sync', async () => {
		let cancel: (() => void) | undefined;
		const { modal, updates, added } = setup({
			library: [owned('10', 'Half-Life'), owned('11', 'Half-Life 2'), owned('20', 'Portal')],
			games: [{ id: 'hl', title: 'Half-Life', steamAppId: '10' }, { id: 'hl2', title: 'Half-Life 2', steamAppId: '11' }],
			onAchievements: () => cancel?.(),
		});
		await openPlan(modal);
		clickByText(modal.contentEl, 'button', 'All');
		cancel = () => clickByText(modal.contentEl, 'button', 'Cancel');
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(modal.contentEl.querySelector('h2')!.textContent).toBe('Sync stopped'));
		expect(updates.map((u) => u.gameId)).toEqual(['hl']);
		expect(added).toHaveLength(0);
		expect(modal.contentEl.textContent).toContain('Everything processed before you stopped has been saved.');
	});

	it('only reports a Notice when the modal closed mid-run', async () => {
		let close: (() => void) | undefined;
		const { modal, updates } = setup({
			library: [owned('10', 'Half-Life')],
			games: [{ id: 'hl', title: 'Half-Life', steamAppId: '10' }],
			onAchievements: () => close?.(),
		});
		await openPlan(modal);
		close = () => modal.close();
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(shownNotices.at(-1)).toBe('Steam sync: 1 updated, 0 imported.'));
		expect(updates).toHaveLength(1);
		expect(modal.contentEl.querySelector('h2')).toBeNull();
	});

	it('ignores a second run while one is in flight', async () => {
		const { modal, updates } = setup({
			library: [owned('10', 'Half-Life')],
			games: [{ id: 'hl', title: 'Half-Life', steamAppId: '10' }],
		});
		await openPlan(modal);
		const run = (modal as unknown as { run(): Promise<void> }).run.bind(modal);
		await Promise.all([run(), run()]);
		expect(updates).toHaveLength(1);
	});
});

describe('SteamSyncModal imported game', () => {
	const NOW = '2026-03-04T05:06:07.000Z';
	beforeEach(() => {
		// without fake timers this mocks Date only, so vi.waitFor does not move the clock
		vi.setSystemTime(NOW);
	});
	afterEach(() => { vi.useRealTimers(); });

	async function importAll(opts: Opts, achievements = true): Promise<Game[]> {
		const { modal, added } = setup(opts);
		await openPlan(modal);
		if (!achievements) {
			const box = modal.contentEl.querySelector<HTMLInputElement>('.hoard-steam-sync__option input')!;
			box.checked = false;
			box.dispatchEvent(new Event('change'));
		}
		clickByText(modal.contentEl, 'button', 'All');
		clickByText(modal.contentEl, 'button', 'Sync');
		await vi.waitFor(() => expect(modal.contentEl.querySelector('h2')!.textContent).toBe('Sync complete'));
		return added;
	}

	it('builds the complete game from library and storefront data', async () => {
		const added = await importAll({
			library: [{ appId: '20', name: 'Portal', playtimeMinutes: 120, lastPlayed: '2026-01-02T00:00:00.000Z' }],
			details: { '20': portalDetails },
		});
		expect(added).toStrictEqual([{
			id: 'g-Portal (store)', title: 'Portal (store)', developer: 'Valve', publisher: 'Valve', type: 'rpg', status: 'Backlog',
			priority: '', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 120,
			achievementsEarned: 3, achievementsTotal: 10, platforms: [], singleplayer: true, coop: true, multiplayer: false,
			coverUrl: 'https://img.test/portal.jpg', apiSource: '', apiId: '', steamAppId: '20', lastPlayed: '2026-01-02T00:00:00.000Z',
			storeUrl: 'https://store.test/portal', externalLink: '', vaultPage: '', releaseDate: '2007-10-10',
			dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW,
		}]);
	});

	it('builds the complete game from library data alone', async () => {
		const added = await importAll({ library: [owned('30', '', 45)] }, false);
		expect(added).toStrictEqual([{
			id: 'g-App 30', title: 'App 30', developer: '', publisher: '', type: 'Action', status: 'Backlog',
			priority: '', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 45,
			achievementsEarned: 0, achievementsTotal: 0, platforms: [], singleplayer: false, coop: false, multiplayer: false,
			coverUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/30/library_600x900.jpg', apiSource: '', apiId: '',
			steamAppId: '30', lastPlayed: null, storeUrl: 'https://store.steampowered.com/app/30/', externalLink: '', vaultPage: '',
			releaseDate: null, dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW,
		}]);
	});

	it('keeps an empty storefront cover and a missing release date', async () => {
		const added = await importAll({
			library: [owned('20', 'Portal')],
			details: { '20': { ...portalDetails, coverUrl: '', storeUrl: '', releaseDate: null } },
		});
		expect(added[0]).toMatchObject({ coverUrl: '', storeUrl: '', releaseDate: null });
	});
});
