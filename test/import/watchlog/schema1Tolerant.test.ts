import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { setupSchema1 } from './setupSchema1';
import { mergeSideFiles } from '../../../src/import/watchlog/schema1';
import { registerTypes } from '../../../src/import/watchlog/registerTypes';
import { prepareData } from '../../../src/import/watchlog/schema1Read';
import { importContext } from './helpers';
import { createFakeApp } from '../../fakes/fakeApp';
import { LocalStore } from '../../../src/storage/LocalStore';

type Data = Record<string, unknown> & { titles: unknown[]; games: { games: unknown[]; groups: unknown[]; settings: Record<string, unknown> }; history: unknown[] };

const cloneData = (): Data => structuredClone(watchLogData);

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;

const baseOf = (files: Map<string, string>): Record<string, Record<string, unknown>> =>
	(parse(files.get('Hoard/Hoard.base') ?? '') as { hoard: Record<string, Record<string, unknown>> }).hoard;

describe('WatchLog import of wrongly typed data', () => {
	it('a title without a text title is reported, the other titles still import', async () => {
		const data = cloneData();
		data.titles = [{ id: 'bad', title: 5 }, ...data.titles];
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'title 1', reason: 'error', code: 'failed' }));
		expect(f.files.has('Hoard/TV Show/Dark.md')).toBe(true);
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(true);
		expect(f.files.get('Hoard/Hoard.base')).toContain('hoard:');
	});

	it('games that is no list imports everything else', async () => {
		const data = cloneData();
		data.games = {} as Data['games'];
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.has('Hoard/TV Show/Dark.md')).toBe(true);
		expect(f.files.has('Hoard/Games/Hades.md')).toBe(false);
		expect(baseOf(f.files).games).toBeDefined();
	});

	it('reading, groups, airtime and history of the wrong type import the rest', async () => {
		const data = { ...cloneData(), reading: 'x', groups: 5, airtime: {}, history: 'x', maybe: null };
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.has('Hoard/TV Show/Dark.md')).toBe(true);
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(false);
	});

	it('a book without a title is reported, the manga still imports', async () => {
		const data = cloneData() as Data & { reading: { books: unknown[] } };
		data.reading.books = [{ id: 'b', title: null }, ...data.reading.books];
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'book 1', reason: 'error' }));
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(true);
		expect(f.files.has('Hoard/Manga/Berserk.md')).toBe(true);
	});

	it('history entries without a date or a message are skipped, the others import', async () => {
		const data = cloneData();
		data.history = [
			'junk', { id: 'x', message: 'no date' }, { id: 'y', timestamp: 'nonsense', message: 'bad date' },
			{ id: 'z', timestamp: '2025-03-01T00:00:00.000Z' },
			{ id: 'ok', timestamp: '2025-03-02T00:00:00.000Z', message: '"Dark" was added', titleName: 'Dark', source: 'Watchlist', action: 'weird' },
		];
		const { run, f } = await setupSchema1(data, {});
		await run();
		const history = f.files.get('Hoard/History.md') ?? '';
		expect(history).toContain('Dark');
		expect(history).not.toContain('no date');
		expect(history).not.toContain('bad date');
	});

	it('links a history entry by name only when exactly one note has it', async () => {
		const data = cloneData();
		data.history = [
			{ id: 'a', timestamp: '2025-03-02T00:00:00.000Z', message: '"Dark" was added', titleName: 'Dark', source: 'Watchlist', action: 'added' },
			{ id: 'b', timestamp: '2025-03-03T00:00:00.000Z', message: '"Nobody" was added', titleName: 'Nobody', source: 'Watchlist', action: 'added' },
			{ id: 'c', timestamp: '2025-03-04T00:00:00.000Z', message: '"Dark" was watched', titleName: 'Dark', titleId: 'kept', source: 'Watchlist', action: 'watched' },
		];
		const { run, f } = await setupSchema1(data, {});
		await run();
		const history = f.files.get('Hoard/History.md') ?? '';
		expect(history).toContain('[[TV Show/Dark]]');
		expect(history).toContain('Nobody');
		expect(history).not.toContain('[[TV Show/Dark]] was watched');
	});

	it('games: platform names become tags, unreadable platforms and statuses fall back', async () => {
		const data = cloneData();
		data.games.settings = { ...data.games.settings, platforms: ['Windows PC', 5, null, { name: 'Switch', color: '#fff' }], statuses: 'x' };
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.errors).toEqual([]);
		const games = baseOf(f.files).games as { platforms: { name: string; color: string }[]; statuses: { name: string }[] };
		expect(games.platforms.map((p) => p.name)).toEqual(['Windows PC', 'Switch']);
		expect(games.platforms[1]?.color).toBe('#fff');
		expect(games.statuses.length).toBeGreaterThan(0);
	});

	it('games: Wishlist becomes a flag, the old text playtime minutes, and the filter drops Wishlist', async () => {
		const data = cloneData();
		data.games.settings = {
			...data.games.settings,
			defaultStatus: 'Wishlist',
			statuses: [{ name: 'Playing', color: '#111' }, { name: 'Wishlist', color: '#222' }],
		};
		const { run, f } = await setupSchema1(data, {});
		await run();
		const fm = fmOf(f.files.get('Hoard/Games/Hades.md'));
		expect(fm.Wishlist).toBe(true);
		expect(fm.Playtime).toBe('12h 30m');
		const games = baseOf(f.files).games as { defaultStatus: string; statuses: { name: string }[] };
		expect(games.defaultStatus).toBe('Not started');
		expect(games.statuses.map((s) => s.name)).toEqual(['Playing', 'TBA']);
	});

	it('games: a Wishlist status is dropped when TBA exists, a game without status takes the default', async () => {
		const data = cloneData();
		data.games.settings = {
			...data.games.settings, defaultStatus: 'Playing',
			statuses: [{ name: 'Wishlist', color: '#222' }, { name: 'TBA', color: '#333' }],
		};
		data.games.games = [{ id: 'g', title: 'Hollow' }];
		const { run, f } = await setupSchema1(data, {});
		await run();
		const games = baseOf(f.files).games as { statuses: { name: string }[] };
		expect(games.statuses.map((s) => s.name)).toEqual(['TBA']);
		expect(fmOf(f.files.get('Hoard/Games/Hollow.md')).Status).toBe('Playing');
	});

	it('games: a group without a name is left out, a playtime in minutes is kept', async () => {
		const data = cloneData();
		data.games.groups = [{ id: 'x', name: '', gameIds: ['hades'], dateAdded: '2025-01-13T08:00:00.000Z' }, 'junk', ...data.games.groups];
		(data.games.games[0] as Record<string, unknown>).playtimeMinutes = 90;
		const { run, f } = await setupSchema1(data, {});
		await run();
		expect(fmOf(f.files.get('Hoard/Games/Hades.md')).Playtime).toBe('1h 30m');
		expect(f.files.get('Hoard/History.md')).toContain('Roguelikes');
	});

	it('a stored Wishlist filter exclude is removed, wrong-typed entries with it', async () => {
		const data = cloneData();
		(data.settings as { gamesFilters?: unknown }).gamesFilters = { statusExclude: ['Wishlist', 'Playing', 5] };
		const { run, local } = await setupSchema1(data, {});
		await run();
		expect(local.data.settings.gamesFilters).toEqual({ statusExclude: ['Playing'] });
	});

	it('airtime entries without a schedule or a title id are skipped', async () => {
		const data = cloneData();
		data.airtime = [null, { id: 'a', titleId: 'dark' }, { id: 'b', schedule: { recurrence: 'weekly' } }, ...(data.airtime as unknown[])];
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/Airtime Recurrence: weekly/);
	});

	it('custom columns without an id are dropped', async () => {
		const data = cloneData();
		(data.reading as { bookColumns: unknown[] }).bookColumns = [{ name: 'No id' }, 'junk', { id: 'a', name: 'Foo', type: 'weird', options: [1, 'x'] }];
		const { run } = await setupSchema1(data, {});
		const r = await run();
		expect(r.errors).toEqual([]);
	});
});

describe('prepareData', () => {
	it('keeps what an earlier read skipped and adds to it', () => {
		const once = prepareData({ titles: [{ title: 5 }], skipped: ['maybe 3'], games: { games: [{}] } });
		expect(once.skipped).toEqual(['maybe 3', 'title 1', 'game 1']);
		expect(prepareData(once).skipped).toEqual(['maybe 3', 'title 1', 'game 1']);
	});

	it('reads an empty value as empty data', () => {
		const data = prepareData(null);
		expect(data.titles).toEqual([]);
		expect(data.reading.books).toEqual([]);
		expect(data.games.games).toEqual([]);
		expect(data.settings).toEqual({});
	});
});

it('prepareData drops Wishlist from the saved games filter', () => {
	const data = prepareData({ games: { settings: { savedFilterPreset: { statusExclude: ['Wishlist', 'Playing', 5] } } } });
	expect(data.games.settings.savedFilterPreset?.statusExclude).toEqual(['Playing']);
});

describe('mergeSideFiles', () => {
	it('reads reading.json and history.json field by field', async () => {
		const { f } = await setupSchema1(watchLogData, {});
		f.adapterFiles.set('.obsidian/plugins/hoard/reading.json', JSON.stringify({ books: [{ id: 'b', title: 'Dune' }, { id: 'c' }], manga: 5 }));
		f.adapterFiles.set('.obsidian/plugins/hoard/history.json', JSON.stringify({
			entries: [{ id: 'h1', timestamp: '2024-01-02T03:04:05.000Z', message: 'Old event' }, { id: 'h2' }, 'junk'],
		}));
		const data = prepareData({ titles: [] });
		await mergeSideFiles(f.app.vault.adapter, '.obsidian/plugins/hoard', data);
		expect(data.reading.books.map((b) => b.title)).toEqual(['Dune']);
		expect(data.skipped).toEqual(['book 2']);
		expect(data.history?.map((h) => h.message)).toEqual(['Old event']);
	});

	it('ignores side files that are no objects', async () => {
		const { f } = await setupSchema1(watchLogData, {});
		f.adapterFiles.set('.obsidian/plugins/hoard/reading.json', '[]');
		f.adapterFiles.set('.obsidian/plugins/hoard/history.json', '"x"');
		const data = prepareData({ titles: [] });
		await mergeSideFiles(f.app.vault.adapter, '.obsidian/plugins/hoard', data);
		expect(data.reading.books).toEqual([]);
		expect(data.history).toEqual([]);
	});
});

describe('registerTypes', () => {
	const setup = (stored: unknown) => {
		const f = createFakeApp({ 'Hoard/Hoard.base': `hoard:\n  types: ${JSON.stringify(stored)}\n` });
		const ctx = importContext(f, new LocalStore(f.plugin), 'Hoard', []);
		return { ctx, f };
	};
	const typesOf = (f: ReturnType<typeof createFakeApp>): { name: string; color?: string }[] =>
		(parse(f.files.get('Hoard/Hoard.base') ?? '') as { hoard: { types: { name: string; color?: string }[] } }).hoard.types;

	it('adds unknown types, a type without a color gets a neutral one, junk is skipped', async () => {
		const { ctx, f } = setup([{ name: 'Movie', color: '#111' }]);
		await registerTypes(ctx, [{ name: 'Movie', color: '#999' }, { name: 'Anime' }, { name: '' }, 'junk', null]);
		expect(typesOf(f)).toEqual([{ name: 'Movie', color: '#111' }, { name: 'Anime', color: '#888780' }]);
	});

	it('does not throw on a stored types value that is no list', async () => {
		const { ctx } = setup('x');
		await expect(registerTypes(ctx, [{ name: 'Anime', color: '#123' }])).resolves.toBeUndefined();
	});

	it('does nothing when the source lists no types', async () => {
		const { ctx, f } = setup([{ name: 'Movie', color: '#111' }]);
		const before = f.files.get('Hoard/Hoard.base');
		await registerTypes(ctx, 'x');
		expect(f.files.get('Hoard/Hoard.base')).toBe(before);
	});
});
