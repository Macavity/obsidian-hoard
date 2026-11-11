import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { setupSchema1 } from './setupSchema1';
import { mergeSideFiles } from '../../../src/import/watchlog/schema1';
import type { WatchLogData } from '../../../src/import/watchlog/schema1Types';
import { LocalStore } from '../../../src/storage/LocalStore';

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;

type Named = { name: string };
interface BaseBlock {
	statuses: Named[];
	reading: Record<string, unknown>;
	games: { platforms: unknown; statuses: Named[] };
}

describe('importWatchLogData', () => {
	it('imports titles, series progress, groups, maybe, airtime and history', async () => {
		const { run, f } = await setupSchema1(watchLogData, { 'Hoard/Movie/Das doppelte Lottchen.md': '---\nName: "Das doppelte Lottchen"\nType: "Movie"\nStatus: "Completed"\n---\n\n## Notes\n' });
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/Watched Episodes: S01E01-E10, S02E01-E02/);
		expect(f.files.get('Hoard/Movie/A.md')).toMatch(/Groups:\n\s+- Marvel/);
		expect(f.files.get('Hoard/Movie/Maybe Film.md')).toMatch(/Maybe: true/);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/Airtime Recurrence: weekly/);
		expect(f.files.get('Hoard/History.md')).toContain('group-created · Marvel');
		expect(f.files.get('Hoard/Hoard.base')).toContain('hoard:');
		expect(f.files.get('Hoard/Hoard.base')).not.toMatch(/ApiKey|Secret/);
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(true);
		expect((f.plugin.data as { schemaVersion: number }).schemaVersion).toBe(2);
	});

	it('a failing note is reported, the rest still imports', async () => {
		const { run, f } = await setupSchema1(watchLogData, {});
		const create = f.app.vault.create.bind(f.app.vault);
		f.app.vault.create = (path, data) => (path === 'Hoard/Movie/A.md' ? Promise.reject(new Error('disk full')) : create(path, data));
		const r = await run();
		expect(r.errors).toEqual(['Hoard/Movie/A.md: disk full']);
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'Hoard/Movie/A.md', reason: 'error' }));
		expect(f.files.has('Hoard/TV Show/Dark.md')).toBe(true);
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(true);
		expect(f.files.get('Hoard/Hoard.base')).toContain('hoard:');
	});

	it('a game without title is reported, later games still import', async () => {
		const data = structuredClone(watchLogData) as unknown as WatchLogData;
		const games = data.games!.games;
		data.games!.games = [{ ...games[0]!, id: 'bad', title: null as never }, ...games];
		const { run, f } = await setupSchema1(data, {});
		const r = await run();
		expect(r.review.some((i) => i.reason === 'error')).toBe(true);
		expect(f.files.has('Hoard/Games/Hades.md')).toBe(true);
		expect(f.files.get('Hoard/Hoard.base')).toContain('hoard:');
	});

	it('history of a note that failed stays plain text, not a dead link', async () => {
		const { run, f } = await setupSchema1(watchLogData, {});
		const create = f.app.vault.create.bind(f.app.vault);
		f.app.vault.create = (path, data) => (path === 'Hoard/TV Show/Dark.md' ? Promise.reject(new Error('nope')) : create(path, data));
		await run();
		expect(f.files.get('Hoard/History.md')).not.toContain('[[TV Show/Dark]]');
	});

	it('titles differing only in case get separate notes (case-insensitive file systems)', async () => {
		const data = structuredClone(watchLogData) as unknown as WatchLogData;
		data.titles = [
			{ ...data.titles[0]!, id: 'x1', title: 'Heat', type: 'Movie' },
			{ ...data.titles[0]!, id: 'x2', title: 'heat', type: 'Movie' },
		];
		const { run, f } = await setupSchema1(data, {});
		expect((await run()).errors).toEqual([]);
		expect(f.files.has('Hoard/Movie/Heat.md')).toBe(true);
		expect(f.files.has('Hoard/Movie/heat 2.md')).toBe(true);
	});

	it('never overwrites existing note values', async () => {
		const { run, f } = await setupSchema1(watchLogData, {
			'Hoard/Movie/A.md': '---\nName: A\nType: Movie\nRating: 5\n---\n',
			'Hoard/TV Show/Dark.md': '---\nName: "Dark"\nType: "TV Show"\nStatus: "Watching"\nPriority: "High"\nRating: 0\nProgress: 67\nTotal Episodes: 18\n---\n\n## Notes\n\nGreat show\n',
			'Hoard/Manga/Berserk.md': '---\nName: "Berserk"\nAuthor: "Kentaro Miura"\nStatus: "On Hold"\nType: manga\n---\n\n## Notes\n\n\n## Quotes\n',
		});
		await run(); // the data has rating 2 for A
		expect(f.files.get('Hoard/Movie/A.md')).toMatch(/Rating: 5/);
		// the body and the existing note body stay untouched
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/## Notes\n\nGreat show\n$/);
		expect(fmOf(f.files.get('Hoard/Manga/Berserk.md')).Status).toBe('On Hold');
	});

	it('is idempotent', async () => {
		const { run, f, rerun } = await setupSchema1(watchLogData, {});
		await run();
		const snapshot = new Map(f.files);
		const r = await rerun(); // same data again (simulates another device)
		expect(r.errors).toEqual([]);
		expect(r.created + r.filled).toBe(0);
		expect(f.files).toEqual(snapshot);
	});

	it('keeps an existing device API key, also after reopening the store', async () => {
		const { run, f, local } = await setupSchema1(watchLogData, {});
		f.plugin.data = { schemaVersion: 2, settings: { tmdbApiKey: 'mine' }, cache: {}, ui: {} };
		await local.load();
		await run();
		const reopened = new LocalStore(f.plugin);
		await reopened.load();
		expect(reopened.data.settings.tmdbApiKey).toBe('mine');
	});

	it('moves imported API keys into secret storage, never into data.json', async () => {
		const { run, f, local } = await setupSchema1(watchLogData, {}, true);
		await run();
		expect(f.secrets.get('hoard-tmdb-api-key')).toBe('tmdb-SecretValue');
		expect(JSON.stringify(f.plugin.data)).not.toMatch(/SecretValue|tmdbApiKey/);
		expect(local.data.settings.tmdbApiKey).toBeUndefined();
	});

	it('keeps secrets and device state local and translates ids', async () => {
		const { run, f, local } = await setupSchema1(watchLogData, {});
		await run();
		const data = local.data;
		expect(data.settings.tmdbApiKey).toBe('tmdb-SecretValue');
		expect(data.settings.cardSize).toBe(1);
		expect('rootFolder' in data.settings).toBe(false);
		expect('statuses' in data.settings).toBe(false);
		expect(data.settings.gamesFilters).toMatchObject({ statusExclude: ['Dropped'] });
		for (const [path, content] of f.files) expect(content, path).not.toMatch(/SecretValue|76561190000000000/);
		expect(data.cache['Movie/A']).toMatchObject({ tmdbId: 1, director: ['Some Director'] });
		expect(data.cache['TV Show/Dark']?.seasons).toHaveLength(2);

		const base = fmOf(`---\n${f.files.get('Hoard/Hoard.base') ?? ''}\n---`).hoard as BaseBlock;
		expect(base.statuses.some((s) => s.name === 'Rewatching')).toBe(true);
		expect(base.reading).not.toHaveProperty('defaultFolder');
		expect(base.games).not.toHaveProperty('defaultFolder');
		expect(base.games.platforms).toEqual([{ name: 'Windows PC', color: '#378ADD' }, { name: 'Steam Deck', color: '#888780' }]);
		expect(base.games.statuses.map((s) => s.name)).toEqual(['Playing', 'Not started', 'TBA']);

		const hades = fmOf(f.files.get('Hoard/Games/Hades.md'));
		expect(hades).toMatchObject({ Developer: 'Supergiant', Wishlist: true, Status: 'Not started', Playtime: '12h 30m', Groups: ['Roguelikes'] });
		expect(fmOf(f.files.get('Hoard/Books/Dune.md'))).toMatchObject({ 'Pages Read': 120, 'Total Pages': 600, 'External ID': 'gbooks:B1' });
		// the 'once' schedule is dropped (E1)
		expect(f.files.get('Hoard/Movie/A.md')).not.toMatch(/Airtime/);
		expect(fmOf(f.files.get('Hoard/TV Show/Dark.md'))).toMatchObject({ 'Airtime Day': 4, 'Airtime Time': '20:00', 'Airtime Season': 2, 'Airtime Episode': 3 });
		expect(f.files.get('Hoard/History.md')).toContain('[[TV Show/Dark]]');
	});

	it('merges reading.json and history.json of very old installs', async () => {
		const { f } = await setupSchema1(watchLogData, {});
		const { reading, history: _history, migratedReadingHistory: _flag, ...rest } = structuredClone(watchLogData) as unknown as WatchLogData;
		const data: WatchLogData = rest;
		f.adapterFiles.set('.obsidian/plugins/hoard/reading.json', JSON.stringify(reading));
		f.adapterFiles.set('.obsidian/plugins/hoard/history.json', JSON.stringify({
			entries: [{ id: 'h1', timestamp: '2024-01-02T03:04:05.000Z', message: 'Old event', titleName: 'Dark' }],
		}));
		await mergeSideFiles(f.app.vault.adapter, '.obsidian/plugins/hoard', data);
		expect(data.reading?.books.map((b) => b.title)).toContain('Dune');
		expect(data.history?.map((h) => h.message)).toEqual(['Old event']);
	});
});
