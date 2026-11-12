import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, Platform } from 'obsidian';
import { GameDetailModal } from '../src/GameDetailModal';
import { DEFAULT_SETTINGS, type Game, type GameGroup } from '../src/types';
import { t } from '../src/i18n';

const shown = (Notice as unknown as { shown: string[] }).shown;

vi.mock('../src/NoteLinkButton', () => ({
	appendNoteLinkButton: (_app: unknown, parent: HTMLElement) => parent.createSpan({ cls: 'note-link-stub' }),
}));

// the shared DOM polyfills lack hasClass, which the Steam pull button uses as its in-flight guard
const elProto = Element.prototype as unknown as { hasClass?: (this: Element, c: string) => boolean };
elProto.hasClass ??= function (this: Element, c: string) { return this.classList.contains(c); };

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const mkGame = (over: Partial<Game> = {}): Game => ({
	id: 'g1', title: 'Hades', developer: 'Supergiant', publisher: '', type: 'Action', status: 'Playing',
	priority: '', favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0,
	achievementsEarned: 0, achievementsTotal: 0, platforms: [], singleplayer: true, coop: false,
	multiplayer: false, coverUrl: '', apiSource: '', apiId: '', steamAppId: '', lastPlayed: null,
	storeUrl: '', externalLink: '', vaultPage: '', releaseDate: null, dateStarted: null,
	dateFinished: null, dateAdded: '', dateModified: '',
	...over,
});

const mkGroup = (id: string, gameIds: string[]): GameGroup => ({
	id, name: `Group ${id}`, gameIds, dateAdded: '',
});

interface SteamOpts {
	creds?: boolean;
	library?: { ok: boolean; games: { appId: string; playtimeMinutes: number; lastPlayed: string | null }[] };
	achievements?: { earned: number; total: number } | null;
}

interface Opts {
	game?: Game;
	groups?: GameGroup[];
	steam?: SteamOpts;
	mobile?: boolean;
}

function build(o: Opts = {}) {
	const game = o.game ?? mkGame();
	const groups = o.groups ?? [];
	const gameData = {
		getGroups: vi.fn(() => groups),
		getSettings: vi.fn(() => ({
			statuses: [{ name: 'Playing', color: '#0f0' }],
			types: [{ name: 'Action', color: '#f00' }],
			platforms: ['PC'],
		})),
		readGameNotes: vi.fn(() => Promise.resolve('')),
		writeGameNotes: vi.fn(() => Promise.resolve()),
		updateGame: vi.fn(() => Promise.resolve()),
		updateGroup: vi.fn(() => Promise.resolve()),
		addGroup: vi.fn(() => Promise.resolve()),
		addGameToGroup: vi.fn(() => Promise.resolve()),
		generateGroupId: vi.fn((name: string) => `id-${name}`),
		noteFilePath: vi.fn(() => 'Hoard/Hades.md'),
		removeGame: vi.fn(() => Promise.resolve()),
	};
	const steam = o.steam ?? {};
	const apiService = {
		hasSteamCredentials: vi.fn(() => steam.creds ?? false),
		getSteamOwnedGames: vi.fn(() => Promise.resolve(steam.library ?? { ok: true, games: [] })),
		getSteamAchievements: vi.fn(() => Promise.resolve(steam.achievements ?? null)),
	};
	const plugin = {
		settings: { ...DEFAULT_SETTINGS },
		apiService,
		app: {},
	};
	(Platform as { isMobile: boolean }).isMobile = o.mobile ?? false;
	const modal = new GameDetailModal({} as never, plugin as never, gameData as never, game);
	modal.open();
	const root = (modal as unknown as { contentEl: HTMLElement }).contentEl;
	const draft = () => (modal as unknown as { draft: Game }).draft;
	return { modal, root, gameData, apiService, draft };
}

const q = <T extends HTMLElement>(root: HTMLElement, sel: string): T => root.querySelector<T>(sel)!;
const type = (input: HTMLInputElement, value: string, event: string): void => {
	input.value = value;
	input.dispatchEvent(new Event(event));
};

beforeEach(() => { shown.length = 0; });
afterEach(() => {
	(Platform as { isMobile: boolean }).isMobile = false;
	document.body.innerHTML = '';
	vi.clearAllMocks();
});

describe('GameDetailModal progress section', () => {
	it('renders the bar from the draft with the genre colour and a11y state', () => {
		const { root } = build({ game: mkGame({ progress: 40, playtimeMinutes: 90, achievementsEarned: 3, achievementsTotal: 10 }) });
		const section = q(root, '.hoard-game-detail__section--progress');
		expect(section.style.getPropertyValue('--hoard-game-detail-progress-color')).toBe('#f00');
		const bar = q(root, '.hoard-game-detail__progress-bar');
		expect(bar.getAttribute('aria-valuenow')).toBe('40');
		expect(bar.getAttribute('aria-valuetext')).toBe('40%');
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__progress-input').value).toBe('40');
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--time').value).toBe('1h 30m');
		const [earned, total] = Array.from(root.querySelectorAll<HTMLInputElement>('.hoard-game-detail__stat-input--number'));
		expect([earned!.value, total!.value]).toEqual(['3', '10']);
	});

	it('leaves the colour unset for an unknown genre and the time empty without playtime', () => {
		const { root } = build({ game: mkGame({ type: 'Unknown' }) });
		const section = q(root, '.hoard-game-detail__section--progress');
		expect(section.style.getPropertyValue('--hoard-game-detail-progress-color')).toBe('');
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--time').value).toBe('');
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--number').value).toBe('');
	});

	it('steps by 5 and clamps to 0..100, marking 100 as complete', () => {
		const { root, draft } = build({ game: mkGame({ progress: 98 }) });
		const [minus, plus] = Array.from(root.querySelectorAll<HTMLButtonElement>('.hoard-game-detail__step'));
		expect(minus!.textContent).toBe('-5');
		expect(plus!.textContent).toBe('+5');
		plus!.click();
		expect(draft().progress).toBe(100);
		expect(q(root, '.hoard-game-detail__progress-percent').classList.contains('is-complete')).toBe(true);
		minus!.click();
		expect(draft().progress).toBe(95);
		expect(q(root, '.hoard-game-detail__progress-percent').classList.contains('is-complete')).toBe(false);
		for (let i = 0; i < 25; i++) minus!.click();
		expect(draft().progress).toBe(0);
	});

	it('commits a typed percentage on change and blur, rounding, clamping and treating empty as 0', () => {
		const { root, draft } = build({ game: mkGame({ progress: 20 }) });
		const input = q<HTMLInputElement>(root, '.hoard-game-detail__progress-input');
		type(input, '55.6', 'change');
		expect(draft().progress).toBe(56);
		type(input, '250', 'blur');
		expect(draft().progress).toBe(100);
		expect(input.value).toBe('100');
		// a number input reports '' for unparsable text, which reads as 0
		type(input, '', 'change');
		expect(draft().progress).toBe(0);
		expect(input.value).toBe('0');
	});

	it('commits freeform playtime and normalises the field', () => {
		const { root, draft } = build();
		const input = q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--time');
		type(input, '2h 15m', 'change');
		expect(draft().playtimeMinutes).toBe(135);
		expect(input.value).toBe('2h 15m');
		type(input, '', 'blur');
		expect(draft().playtimeMinutes).toBe(0);
		expect(input.value).toBe('');
	});
});

describe('GameDetailModal achievements', () => {
	const inputs = (root: HTMLElement) => {
		const [earned, total] = Array.from(root.querySelectorAll<HTMLInputElement>('.hoard-game-detail__stat-input--number'));
		return { earned: earned!, total: total! };
	};

	it('stores earned and total, capping earned at a known total', () => {
		const { root, draft } = build();
		const { earned, total } = inputs(root);
		type(total, '10', 'change');
		type(earned, '15', 'change');
		expect(draft().achievementsTotal).toBe(10);
		expect(draft().achievementsEarned).toBe(10);
		expect(earned.value).toBe('10');
	});

	it('leaves earned alone while the total is unknown', () => {
		const { root, draft } = build();
		const { earned, total } = inputs(root);
		type(earned, '7', 'blur');
		expect(draft().achievementsEarned).toBe(7);
		expect(draft().achievementsTotal).toBe(0);
		expect(total.value).toBe('');
	});

	it('treats negative and non-numeric input as zero', () => {
		const { root, draft } = build({ game: mkGame({ achievementsEarned: 3, achievementsTotal: 5 }) });
		const { earned, total } = inputs(root);
		type(earned, '-4', 'change');
		type(total, 'abc', 'change');
		expect(draft().achievementsEarned).toBe(0);
		expect(draft().achievementsTotal).toBe(0);
		expect(earned.value).toBe('');
		expect(total.value).toBe('');
	});

	it('offers the derived percentage chip and applies it to the bar on click', () => {
		const { root, draft } = build({ game: mkGame({ progress: 10, achievementsEarned: 5, achievementsTotal: 10 }) });
		const chip = q<HTMLButtonElement>(root, '.hoard-game-detail__derive');
		expect(chip.classList.contains('is-hidden')).toBe(false);
		expect(chip.textContent).toBe('= 50%');
		chip.click();
		expect(draft().progress).toBe(50);
		expect(chip.classList.contains('is-hidden')).toBe(true);
	});

	it('hides the chip without a total or when it equals the progress', () => {
		const { root } = build({ game: mkGame({ progress: 50, achievementsEarned: 5, achievementsTotal: 10 }) });
		expect(q(root, '.hoard-game-detail__derive').classList.contains('is-hidden')).toBe(true);
		const none = build();
		const chip = q<HTMLButtonElement>(none.root, '.hoard-game-detail__derive');
		expect(chip.classList.contains('is-hidden')).toBe(true);
		chip.click();
		expect(none.draft().progress).toBe(0);
	});
});

describe('GameDetailModal progress bar keyboard and pointer', () => {
	const key = (bar: HTMLElement, k: string) => {
		const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
		bar.dispatchEvent(e);
		return e;
	};

	it('moves by 5 with arrow keys and prevents default scrolling', () => {
		const { root, draft } = build({ game: mkGame({ progress: 50 }) });
		const bar = q(root, '.hoard-game-detail__progress-bar');
		expect(key(bar, 'ArrowRight').defaultPrevented).toBe(true);
		expect(draft().progress).toBe(55);
		key(bar, 'ArrowUp');
		expect(draft().progress).toBe(60);
		key(bar, 'ArrowLeft');
		key(bar, 'ArrowDown');
		expect(draft().progress).toBe(50);
		expect(bar.getAttribute('aria-valuenow')).toBe('50');
	});

	it('jumps to the ends with Home and End', () => {
		const { root, draft } = build({ game: mkGame({ progress: 50 }) });
		const bar = q(root, '.hoard-game-detail__progress-bar');
		expect(key(bar, 'End').defaultPrevented).toBe(true);
		expect(draft().progress).toBe(100);
		expect(key(bar, 'Home').defaultPrevented).toBe(true);
		expect(draft().progress).toBe(0);
	});

	it('ignores other keys', () => {
		const { root, draft } = build({ game: mkGame({ progress: 50 }) });
		const bar = q(root, '.hoard-game-detail__progress-bar');
		expect(key(bar, 'a').defaultPrevented).toBe(false);
		expect(draft().progress).toBe(50);
	});
});

describe('GameDetailModal steam pull', () => {
	const steamBtn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.hoard-game-detail__steam-pull');

	it('is absent without credentials or without an appid', () => {
		expect(steamBtn(build({ game: mkGame({ steamAppId: '10' }) }).root)).toBeNull();
		expect(steamBtn(build({ steam: { creds: true } }).root)).toBeNull();
	});

	it('derives the appid from a Steam store url', () => {
		const { root } = build({ game: mkGame({ storeUrl: 'https://store.steampowered.com/app/620/Portal_2/' }), steam: { creds: true } });
		expect(steamBtn(root)).not.toBeNull();
	});

	it('pulls playtime and achievements into the draft and the inputs', async () => {
		const { root, draft, apiService } = build({
			game: mkGame({ steamAppId: '10', progress: 0 }),
			steam: {
				creds: true,
				library: { ok: true, games: [{ appId: '10', playtimeMinutes: 125, lastPlayed: '2025-01-02' }] },
				achievements: { earned: 4, total: 8 },
			},
		});
		const btn = steamBtn(root)!;
		btn.click();
		expect(btn.classList.contains('is-loading')).toBe(true);
		// a second click while loading is ignored
		btn.click();
		await flush();
		expect(apiService.getSteamOwnedGames).toHaveBeenCalledTimes(1);
		expect(apiService.getSteamAchievements).toHaveBeenCalledWith('10');
		expect(draft().playtimeMinutes).toBe(125);
		expect(draft().lastPlayed).toBe('2025-01-02');
		expect(draft().achievementsEarned).toBe(4);
		expect(draft().achievementsTotal).toBe(8);
		expect(draft().steamAppId).toBe('10');
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--time').value).toBe('2h 5m');
		expect(q(root, '.hoard-game-detail__derive').textContent).toBe('= 50%');
		expect(shown).toEqual([t('detail.game.steamPulled')]);
		expect(btn.classList.contains('is-loading')).toBe(false);
	});

	it('applies only the library part when there are no achievements, clearing zero values', async () => {
		const { root, draft } = build({
			game: mkGame({ steamAppId: '10', playtimeMinutes: 60 }),
			steam: { creds: true, library: { ok: true, games: [{ appId: '10', playtimeMinutes: 0, lastPlayed: null }] }, achievements: null },
		});
		steamBtn(root)!.click();
		await flush();
		expect(draft().playtimeMinutes).toBe(0);
		expect(q<HTMLInputElement>(root, '.hoard-game-detail__stat-input--time').value).toBe('');
		expect(draft().achievementsTotal).toBe(0);
		expect(shown).toEqual([t('detail.game.steamPulled')]);
	});

	it('applies only achievements when the game is not in the library, clearing zero earned', async () => {
		const { root, draft } = build({
			game: mkGame({ steamAppId: '10' }),
			steam: { creds: true, library: { ok: true, games: [] }, achievements: { earned: 0, total: 0 } },
		});
		steamBtn(root)!.click();
		await flush();
		expect(draft().playtimeMinutes).toBe(0);
		expect(draft().steamAppId).toBe('10');
		const [earned, total] = Array.from(root.querySelectorAll<HTMLInputElement>('.hoard-game-detail__stat-input--number'));
		expect([earned!.value, total!.value]).toEqual(['', '']);
	});

	it('says there is no record when the library loaded but has nothing', async () => {
		const { root, draft } = build({
			game: mkGame({ steamAppId: '10' }),
			steam: { creds: true, library: { ok: true, games: [] }, achievements: null },
		});
		steamBtn(root)!.click();
		await flush();
		expect(shown).toEqual([t('detail.game.steamNoRecord')]);
		expect(draft().steamAppId).toBe('10');
		expect(steamBtn(root)!.classList.contains('is-loading')).toBe(false);
	});

	it('says Steam is unreachable when the library failed and there are no achievements', async () => {
		const { root, draft } = build({
			game: mkGame(),
			steam: { creds: true, library: { ok: false, games: [] }, achievements: null },
		});
		expect(steamBtn(root)).toBeNull();
		const linked = build({
			game: mkGame({ steamAppId: '99' }),
			steam: { creds: true, library: { ok: false, games: [] }, achievements: null },
		});
		steamBtn(linked.root)!.click();
		await flush();
		expect(shown).toEqual([t('detail.game.steamUnreachable')]);
		expect(linked.draft().steamAppId).toBe('99');
		expect(draft().playtimeMinutes).toBe(0);
	});

	it('still takes achievements when the library failed', async () => {
		const { root, draft } = build({
			game: mkGame({ steamAppId: '10' }),
			steam: { creds: true, library: { ok: false, games: [] }, achievements: { earned: 2, total: 5 } },
		});
		steamBtn(root)!.click();
		await flush();
		expect(draft().achievementsEarned).toBe(2);
		expect(shown).toEqual([t('detail.game.steamPulled')]);
	});
});

describe('GameDetailModal group field', () => {
	const field = (root: HTMLElement) => ({
		select: q<HTMLSelectElement>(root, '.hoard-game-detail__group select'),
		input: q<HTMLInputElement>(root, '.hoard-game-detail__group-new'),
	});
	const groups = () => [mkGroup('a', ['g1']), mkGroup('b', [])];

	it('lists none plus every group and preselects the current one, disabling the name input', () => {
		const { root } = build({ groups: groups() });
		const { select, input } = field(root);
		expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
			['', t('ui.form.none')], ['a', 'Group a'], ['b', 'Group b'],
		]);
		expect(select.options[1]!.selected).toBe(true);
		expect(input.disabled).toBe(true);
	});

	it('starts with both controls enabled for an ungrouped game', () => {
		const { root } = build({ groups: [mkGroup('b', [])] });
		const { select, input } = field(root);
		expect(select.value).toBe('');
		expect(select.disabled).toBe(false);
		expect(input.disabled).toBe(false);
	});

	it('picking a group clears and disables the name input, picking none re-enables it', () => {
		const { root, modal } = build({ groups: [mkGroup('b', [])] });
		const { select, input } = field(root);
		type(input, 'New', 'input');
		select.disabled = false;
		select.value = 'b';
		select.dispatchEvent(new Event('change'));
		const s = modal as unknown as { selectedGroupId: string; newGroupName: string };
		expect(s.selectedGroupId).toBe('b');
		expect(s.newGroupName).toBe('');
		expect(input.value).toBe('');
		expect(input.disabled).toBe(true);
		select.value = '';
		select.dispatchEvent(new Event('change'));
		expect(s.selectedGroupId).toBe('');
		expect(input.disabled).toBe(false);
	});

	it('typing a new name resets and disables the dropdown, clearing it re-enables it', () => {
		const { root, modal } = build({ groups: groups() });
		const { select, input } = field(root);
		input.disabled = false;
		type(input, 'Fresh', 'input');
		const s = modal as unknown as { selectedGroupId: string; newGroupName: string };
		expect(s.newGroupName).toBe('Fresh');
		expect(s.selectedGroupId).toBe('');
		expect(select.value).toBe('');
		expect(select.disabled).toBe(true);
		type(input, '   ', 'input');
		expect(select.disabled).toBe(false);
	});

	it('restores a pending new name and disables the dropdown when re-rendered', () => {
		const { modal, root } = build({ groups: [mkGroup('b', [])] });
		const s = modal as unknown as { newGroupName: string; renderGroupField: (p: HTMLElement) => void };
		s.newGroupName = 'Pending';
		const parent = document.createElement('div');
		s.renderGroupField(parent);
		const sel = parent.querySelector('select')!;
		const input = parent.querySelector<HTMLInputElement>('.hoard-game-detail__group-new')!;
		expect(input.value).toBe('Pending');
		expect(sel.disabled).toBe(true);
		expect(root.querySelectorAll('.hoard-game-detail__group')).toHaveLength(1);
	});
});

describe('GameDetailModal group change on save', () => {
	const save = async (root: HTMLElement) => {
		q<HTMLButtonElement>(root, '.hoard-btn--primary').click();
		await flush();
	};
	const pick = (root: HTMLElement, id: string) => {
		const select = q<HTMLSelectElement>(root, '.hoard-game-detail__group select');
		select.value = id;
		select.dispatchEvent(new Event('change'));
	};

	it('does nothing when the choice is unchanged', async () => {
		const { root, gameData } = build({ groups: [mkGroup('a', ['g1'])] });
		await save(root);
		expect(gameData.updateGame).toHaveBeenCalled();
		expect(gameData.updateGroup).not.toHaveBeenCalled();
		expect(gameData.addGroup).not.toHaveBeenCalled();
		expect(gameData.addGameToGroup).not.toHaveBeenCalled();
	});

	it('moves the game: detaches from the old group and attaches to the picked one', async () => {
		const { root, gameData } = build({ groups: [mkGroup('a', ['g1', 'g2']), mkGroup('b', [])] });
		pick(root, 'b');
		await save(root);
		expect(gameData.updateGroup).toHaveBeenCalledTimes(1);
		expect(gameData.updateGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', gameIds: ['g2'] }));
		expect(gameData.addGameToGroup).toHaveBeenCalledWith('b', 'g1');
		expect(gameData.addGroup).not.toHaveBeenCalled();
	});

	it('sweeps every group the game sits in', async () => {
		const { root, gameData } = build({ groups: [mkGroup('a', ['g1']), mkGroup('b', ['g1']), mkGroup('c', [])] });
		pick(root, 'c');
		await save(root);
		expect((gameData.updateGroup.mock.calls as unknown[][]).map((c) => (c[0] as GameGroup).id)).toEqual(['a', 'b']);
		expect(gameData.addGameToGroup).toHaveBeenCalledWith('c', 'g1');
	});

	it('detaches only when moved to none', async () => {
		const { root, gameData } = build({ groups: [mkGroup('a', ['g1'])] });
		pick(root, '');
		await save(root);
		expect(gameData.updateGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', gameIds: [] }));
		expect(gameData.addGameToGroup).not.toHaveBeenCalled();
		expect(gameData.addGroup).not.toHaveBeenCalled();
	});

	it('creates a new group from a trimmed name and moves the game into it', async () => {
		const { root, gameData } = build({ groups: [mkGroup('a', ['g1'])] });
		type(q<HTMLInputElement>(root, '.hoard-game-detail__group-new'), '  Roguelikes ', 'input');
		await save(root);
		expect(gameData.updateGroup).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', gameIds: [] }));
		expect(gameData.generateGroupId).toHaveBeenCalledWith('Roguelikes');
		expect(gameData.addGroup).toHaveBeenCalledWith(expect.objectContaining({
			id: 'id-Roguelikes', name: 'Roguelikes', gameIds: ['g1'],
		}));
		expect(gameData.addGameToGroup).not.toHaveBeenCalled();
	});

	it('creates a group for a previously ungrouped game without detaching anything', async () => {
		const { root, gameData } = build({ groups: [mkGroup('b', ['g2'])] });
		type(q<HTMLInputElement>(root, '.hoard-game-detail__group-new'), 'Solo', 'input');
		await save(root);
		expect(gameData.updateGroup).not.toHaveBeenCalled();
		expect(gameData.addGroup).toHaveBeenCalledTimes(1);
	});
});
