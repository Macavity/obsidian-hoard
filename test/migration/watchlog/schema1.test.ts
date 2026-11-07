import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { setupSchema1 } from './setupSchema1';
import type { LocalData } from '../../../src/storage/storageTypes';

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;

type Named = { name: string };
interface BaseBlock {
	statuses: Named[];
	reading: Record<string, unknown>;
	games: { platforms: unknown; statuses: Named[] };
}

describe('migrateSchema1', () => {
	it('migrates titles, series progress, groups, maybe, airtime and history', async () => {
		const { run, f } = await setupSchema1(watchLogData, { 'WatchLog/Movie/Das doppelte Lottchen.md': '---\ntitle: "Das doppelte Lottchen"\ntype: "Movie"\nstatus: "Completed"\n---\n\n## Notes\n' });
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.get('WatchLog/TV Show/Dark.md')).toMatch(/watched: S01E01-E10, S02E01-E02/);
		expect(f.files.get('WatchLog/Movie/A.md')).toMatch(/groups:\n\s+- Marvel/);
		expect(f.files.get('WatchLog/Movie/Maybe Film.md')).toMatch(/maybe: true/);
		expect(f.files.get('WatchLog/TV Show/Dark.md')).toMatch(/airtimeRecurrence: weekly/);
		expect(f.files.get('WatchLog/History.md')).toContain('group-created · Marvel');
		expect(f.files.get('WatchLog/Hoard.base')).toContain('hoard:');
		expect(f.files.get('WatchLog/Hoard.base')).not.toMatch(/ApiKey|Secret/);
		expect(f.files.has('WatchLog/Books/Dune.md')).toBe(true); // moved from WatchLog/Reading/Books
		expect([...f.files.keys()].some((p) => p.startsWith('WatchLog/Reading/'))).toBe(false);
		expect(f.adapterFiles.has('.obsidian/plugins/hoard/data.v1-backup.json')).toBe(true);
		expect((f.plugin.data as { schemaVersion: number }).schemaVersion).toBe(2);
	});

	it('never overwrites existing note values', async () => {
		const { run, f } = await setupSchema1(watchLogData, { 'WatchLog/Movie/A.md': '---\ntitle: A\ntype: Movie\nrating: 5\n---\n' });
		await run(); // the data has rating 2 for A
		expect(f.files.get('WatchLog/Movie/A.md')).toMatch(/rating: 5/);
		// the body and the existing note body stay untouched
		expect(f.files.get('WatchLog/TV Show/Dark.md')).toMatch(/## Notes\n\nGreat show\n$/);
		expect(fmOf(f.files.get('WatchLog/Manga/Berserk.md')).status).toBe('On Hold');
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

	it('moves the central folders and keeps conflicting files in place', async () => {
		const { run, f } = await setupSchema1(watchLogData, { 'WatchLog/CustomLists/Shopping.md': '# Mine\n' });
		const r = await run();
		expect(f.files.has('WatchLog/Games/Hades.md')).toBe(true);
		expect(f.files.has('WatchLog/Manga/Berserk.md')).toBe(true);
		expect(f.files.get('WatchLog/CustomLists/Shopping.md')).toBe('# Mine\n');
		expect(f.files.has('Lists/Shopping.md')).toBe(true);
		expect(r.skipped.some((s) => s.includes('Lists/Shopping.md'))).toBe(true);
		expect(r.foldersMoved).toEqual(expect.arrayContaining(['WatchLog/Reading/Books → WatchLog/Books', 'Gaming → WatchLog/Games']));
	});

	it('keeps secrets and device state local and translates ids', async () => {
		const { run, f } = await setupSchema1(watchLogData, {});
		await run();
		const data = f.plugin.data as LocalData & { ui: { gamesRecommendedDaily?: { ids: string[] } } };
		expect(data.settings.tmdbApiKey).toBe('tmdb-SecretValue');
		expect(data.settings.cardSize).toBe(1);
		expect('rootFolder' in data.settings).toBe(false);
		expect('statuses' in data.settings).toBe(false);
		expect(data.settings.gamesFilters).toMatchObject({ statusExclude: ['Dropped'] });
		for (const [path, content] of f.files) expect(content, path).not.toMatch(/SecretValue|76561190000000000/);
		expect(data.cache['Movie/A']).toMatchObject({ tmdbId: 1, director: ['Some Director'] });
		expect(data.cache['TV Show/Dark']?.seasons).toHaveLength(2);
		expect(data.ui.pinnedGroup).toBe('Marvel');
		expect(data.ui.collapsedSeasons).toEqual({ 'TV Show/Dark': [0] });
		expect(data.ui.recommendedDaily).toEqual({ date: '2025-05-01', ids: ['Movie/A', 'TV Show/Dark'] });
		expect(data.ui.gamesRecommendedDaily?.ids).toEqual(['Games/Hades']);
		expect(data.drafts?.dismissed).toEqual(['x']);

		const base = fmOf(`---\n${f.files.get('WatchLog/Hoard.base') ?? ''}\n---`).hoard as BaseBlock;
		expect(base.statuses.some((s) => s.name === 'Rewatching')).toBe(true);
		expect(base.reading).not.toHaveProperty('defaultFolder');
		expect(base.games).not.toHaveProperty('defaultFolder');
		expect(base.games.platforms).toEqual([{ name: 'Windows PC', color: '#378ADD' }, { name: 'Steam Deck', color: '#888780' }]);
		expect(base.games.statuses.map((s) => s.name)).toEqual(['Playing', 'Not started', 'TBA']);

		const hades = fmOf(f.files.get('WatchLog/Games/Hades.md'));
		expect(hades).toMatchObject({ developer: 'Supergiant', wishlist: true, status: 'Not started', playtime: '12h 30m', groups: ['Roguelikes'] });
		expect(fmOf(f.files.get('WatchLog/Books/Dune.md'))).toMatchObject({ pagesRead: 120, totalPages: 600, externalId: 'gbooks:B1' });
		// the 'once' schedule is dropped (E1)
		expect(f.files.get('WatchLog/Movie/A.md')).not.toMatch(/airtime/);
		expect(fmOf(f.files.get('WatchLog/TV Show/Dark.md'))).toMatchObject({ airtimeDay: 4, airtimeTime: '20:00', airtimeSeason: 2, airtimeEpisode: 3 });
		expect(f.files.get('WatchLog/History.md')).toContain('[[TV Show/Dark]]');
	});

	it('does not adopt the new format when a step fails', async () => {
		const { run, f } = await setupSchema1(watchLogData, {});
		f.plugin.manifest.dir = undefined as unknown as string;
		const r = await run();
		expect(r.errors).not.toEqual([]);
		expect((f.plugin.data as { schemaVersion?: number }).schemaVersion).toBeUndefined();
	});
	it('only moves known WatchLog notes and real custom lists', async () => {
		const { run, f } = await setupSchema1(watchLogData, {
			'WatchLog/Reading/Books/Foreign.md': '# mine\n',
			'Gaming/Other.md': '# mine\n',
			'Lists/Readme.md': '# not a list\n',
		});
		await run();
		expect(f.files.has('WatchLog/Reading/Books/Foreign.md')).toBe(true);
		expect(f.files.has('Gaming/Other.md')).toBe(true);
		expect(f.files.has('Lists/Readme.md')).toBe(true);
		expect(f.files.has('WatchLog/Books/Foreign.md')).toBe(false);
		expect(f.files.has('WatchLog/CustomLists/Readme.md')).toBe(false);
		expect(f.files.has('WatchLog/Books/Dune.md')).toBe(true);
		expect(f.files.has('WatchLog/CustomLists/Shopping.md')).toBe(true);
	});

	it('on a second device (base exists) creates no notes and only fills progress', async () => {
		const first = await setupSchema1(watchLogData, {});
		await first.run();
		const base = first.f.files.get('WatchLog/Hoard.base') ?? '';
		const { run, f } = await setupSchema1(watchLogData, {
			'WatchLog/Hoard.base': base,
			'WatchLog/TV Show/Dark.md': '---\ntitle: Dark\ntype: TV Show\nstatus: Watching\n---\n\nmine\n',
			'WatchLog/Movie/Maybe Film.md': '---\ntitle: Maybe Film\ntype: Movie\n---\n',
		});
		const r = await run();
		expect(r.errors).toEqual([]);
		const dark = fmOf(f.files.get('WatchLog/TV Show/Dark.md'));
		expect(dark.watched).toBe('S01E01-E10, S02E01-E02');
		for (const k of ['groups', 'airtimeRecurrence', 'airtimeDay', 'maybe', 'releaseDate']) expect(dark).not.toHaveProperty(k);
		expect(f.files.has('WatchLog/Movie/A.md')).toBe(false);
		expect(f.files.get('WatchLog/Movie/Maybe Film.md')).not.toMatch(/maybe/);
		expect(fmOf(f.files.get('WatchLog/Games/Hades.md'))).not.toHaveProperty('groups'); // moved WatchLog note stays as is
		expect((f.plugin.data as LocalData).cache['TV Show/Dark']?.seasons).toHaveLength(2);
	});

	it('on a second device still creates a maybe title without a note', async () => {
		const first = await setupSchema1(watchLogData, {});
		await first.run();
		const base = first.f.files.get('WatchLog/Hoard.base') ?? '';
		const { run, f } = await setupSchema1(watchLogData, { 'WatchLog/Hoard.base': base });
		await run();
		expect(f.files.get('WatchLog/Movie/Maybe Film.md')).toMatch(/maybe: true/);
	});

	it('merges reading.json and history.json of very old installs', async () => {
		const data = structuredClone(watchLogData) as Record<string, unknown>;
		const reading = data.reading;
		delete data.reading;
		delete data.history;
		delete data.migratedReadingHistory;
		const { run, f } = await setupSchema1(data, {});
		f.adapterFiles.set('.obsidian/plugins/hoard/reading.json', JSON.stringify(reading));
		f.adapterFiles.set('.obsidian/plugins/hoard/history.json', JSON.stringify({
			entries: [{ id: 'h1', timestamp: '2024-01-02T03:04:05.000Z', message: 'Old event', titleName: 'Dark' }],
		}));
		const r = await run();
		expect(r.errors).toEqual([]);
		expect(f.files.has('WatchLog/Books/Dune.md')).toBe(true);
		expect(f.files.get('WatchLog/History.md')).toContain('Old event');
	});
});
