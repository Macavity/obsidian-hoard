import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { WATCHLOG_NOTES, setupSchema1 } from './setupSchema1';
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
		const { run, f } = await setupSchema1(watchLogData, { 'Hoard/Movie/Das doppelte Lottchen.md': '---\ntitle: "Das doppelte Lottchen"\ntype: "Movie"\nstatus: "Completed"\n---\n\n## Notes\n' });
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/watched: S01E01-E10, S02E01-E02/);
		expect(f.files.get('Hoard/Movie/A.md')).toMatch(/groups:\n\s+- Marvel/);
		expect(f.files.get('Hoard/Movie/Maybe Film.md')).toMatch(/maybe: true/);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/airtimeRecurrence: weekly/);
		expect(f.files.get('Hoard/History.md')).toContain('group-created · Marvel');
		expect(f.files.get('Hoard/Hoard.base')).toContain('hoard:');
		expect(f.files.get('Hoard/Hoard.base')).not.toMatch(/ApiKey|Secret/);
		expect(f.files.has('Hoard/Books/Dune.md')).toBe(true);
		expect((f.plugin.data as { schemaVersion: number }).schemaVersion).toBe(2);
	});

	it('never overwrites existing note values', async () => {
		const { run, f } = await setupSchema1(watchLogData, {
			'Hoard/Movie/A.md': '---\ntitle: A\ntype: Movie\nrating: 5\n---\n',
			'Hoard/TV Show/Dark.md': WATCHLOG_NOTES['WatchLog/TV Show/Dark.md']!,
			'Hoard/Manga/Berserk.md': WATCHLOG_NOTES['WatchLog/Reading/Manga/Berserk.md']!,
		});
		await run(); // the data has rating 2 for A
		expect(f.files.get('Hoard/Movie/A.md')).toMatch(/rating: 5/);
		// the body and the existing note body stay untouched
		expect(f.files.get('Hoard/TV Show/Dark.md')).toMatch(/## Notes\n\nGreat show\n$/);
		expect(fmOf(f.files.get('Hoard/Manga/Berserk.md')).status).toBe('On Hold');
	});

	it('is idempotent', async () => {
		const { run, f, rerun } = await setupSchema1(watchLogData, {});
		await run();
		const snapshot = new Map(f.files);
		const r = await rerun(); // same data again (simulates another device)
		expect(r.errors).toEqual([]);
		expect(r.notesCreated + r.notesFilled).toBe(0);
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
		expect(hades).toMatchObject({ developer: 'Supergiant', wishlist: true, status: 'Not started', playtime: '12h 30m', groups: ['Roguelikes'] });
		expect(fmOf(f.files.get('Hoard/Books/Dune.md'))).toMatchObject({ pagesRead: 120, totalPages: 600, externalId: 'gbooks:B1' });
		// the 'once' schedule is dropped (E1)
		expect(f.files.get('Hoard/Movie/A.md')).not.toMatch(/airtime/);
		expect(fmOf(f.files.get('Hoard/TV Show/Dark.md'))).toMatchObject({ airtimeDay: 4, airtimeTime: '20:00', airtimeSeason: 2, airtimeEpisode: 3 });
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
