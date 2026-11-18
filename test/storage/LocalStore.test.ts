import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { LocalStore } from '../../src/shared/storage/LocalStore';
import { SecretStore } from '../../src/shared/storage/SecretStore';
const plugin = (data: unknown) => { const p = { data, loadData: () => Promise.resolve(p.data), saveData: (d: unknown) => { p.data = d; return Promise.resolve(); } }; return p; };
const secrets = () => { const m = new Map<string, string>(); return { m, store: new SecretStore({ getSecret: (id) => m.get(id) ?? null, setSecret: (id, v) => { m.set(id, v); } }) }; };
describe('LocalStore', () => {
	it('initialises empty data as schema 2', async () => {
		const p = plugin(null); const s = new LocalStore(p);
		expect((await s.load()).schema).toBe(2);
		expect(s.data).toMatchObject({ schemaVersion: 2, cache: {}, ui: {} });
	});
	it('merges, renames and deletes cache entries', async () => {
		const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} }); const s = new LocalStore(p);
		await s.load();
		s.setCache('Movie/A', { studio: ['u'] }); s.setCache('Movie/A', { trailerUrl: 't' });
		s.renameCache('Movie/A', 'Movie/B');
		expect(s.getCache('Movie/B')).toEqual({ studio: ['u'], trailerUrl: 't' });
		s.deleteCache('Movie/B'); await s.flush();
		expect((p.data as { cache: object }).cache).toEqual({});
	});
	it('batches lazy cache writes into one save after five seconds', async () => {
		vi.useFakeTimers();
		try {
			const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} }); const s = new LocalStore(p);
			await s.load();
			const save = vi.spyOn(p, 'saveData');
			s.setCache('Movie/A', { tmdbId: 1 }, 'lazy');
			await vi.advanceTimersByTimeAsync(3000);
			s.setCache('Movie/B', { tmdbId: 2 }, 'lazy');
			await vi.advanceTimersByTimeAsync(1999);
			expect(save).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(save).toHaveBeenCalledOnce();
			expect((p.data as { cache: object }).cache).toEqual({ 'Movie/A': { tmdbId: 1 }, 'Movie/B': { tmdbId: 2 } });
		} finally { vi.useRealTimers(); }
	});
	it('a normal change pulls a pending lazy save forward', async () => {
		vi.useFakeTimers();
		try {
			const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} }); const s = new LocalStore(p);
			await s.load();
			const save = vi.spyOn(p, 'saveData');
			s.setCache('Movie/A', { tmdbId: 1 }, 'lazy');
			s.setCache('Movie/B', { tmdbId: 2 });
			await vi.advanceTimersByTimeAsync(100);
			expect(save).toHaveBeenCalledOnce();
			s.setCache('Movie/C', { tmdbId: 3 });
			s.setCache('Movie/D', { tmdbId: 4 }, 'lazy');
			await vi.advanceTimersByTimeAsync(100);
			expect(save).toHaveBeenCalledTimes(2);
		} finally { vi.useRealTimers(); }
	});
	it('flush writes a pending lazy save at once', async () => {
		const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} }); const s = new LocalStore(p);
		await s.load();
		s.setCache('Movie/A', { tmdbId: 1 }, 'lazy');
		await s.flush();
		expect((p.data as { cache: object }).cache).toEqual({ 'Movie/A': { tmdbId: 1 } });
	});
	it('treats schema-1 data as empty and never overwrites it', async () => {
		const data = { titles: [], groups: [], settings: {} };
		const p = plugin(data); const s = new LocalStore(p);
		expect(await s.load()).toEqual({ schema: 'watchlog' });
		expect(s.isWritable).toBe(false);
		s.setCache('Movie/A', { trailerUrl: 'u' });
		await s.flush();
		expect(p.data).toBe(data);
	});
	it('never writes a data.json from a newer version', async () => {
		const newer = { schemaVersion: 3, settings: { x: 1 } };
		const p = plugin(newer); const s = new LocalStore(p);
		expect(await s.load()).toEqual({ schema: 'newer' });
		s.setCache('Movie/A', { trailerUrl: 'u' });
		await s.flush();
		expect(p.data).toBe(newer);
	});
	it('drops empty keys of older versions without setting the marker', async () => {
		const p = plugin({ schemaVersion: 2, settings: { omdbApiKey: '', tmdbApiKey: '', steamId: '', dateFormat: 'dmy' }, cache: {}, ui: {} });
		const { store } = secrets();
		await new LocalStore(p, store).load();
		expect(p.data).toEqual({ schemaVersion: 2, settings: { dateFormat: 'dmy' }, cache: {}, ui: {} });
	});
	it('migrates keys out of data.json on load', async () => {
		const p = plugin({ schemaVersion: 2, settings: { tmdbApiKey: 'T', dateFormat: 'dmy' }, cache: {}, ui: {} });
		const { m, store } = secrets();
		await new LocalStore(p, store).load();
		expect(p.data).toMatchObject({ settings: { dateFormat: 'dmy' }, secretsInStorage: true });
		expect(JSON.stringify(p.data)).not.toContain('"T"');
		expect(m.get('hoard-tmdb-api-key')).toBe('T');
	});
	it('never writes a key that reached settings after load', async () => {
		const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} });
		const { m, store } = secrets();
		const s = new LocalStore(p, store); await s.load();
		s.data.settings.steamApiKey = 'S'; s.queueSave(); await s.flush();
		expect(JSON.stringify(p.data)).not.toContain('steamApiKey');
		expect(m.get('hoard-steam-api-key')).toBe('S');
	});
	it('does not absorb from a WatchLog data.json', async () => {
		const data = { titles: [], settings: { tmdbApiKey: 'T' } };
		const { m, store } = secrets();
		await new LocalStore(plugin(data), store).load();
		expect(m.size).toBe(0);
	});
	it('does not rewrite data.json on load when nothing was migrated', async () => {
		const p = plugin({ schemaVersion: 2, settings: { dateFormat: 'dmy' }, cache: {}, ui: {} });
		const saveSpy = vi.spyOn(p, 'saveData');
		await new LocalStore(p, secrets().store).load();
		expect(saveSpy).not.toHaveBeenCalled();
	});
	it('persists the secretsInStorage marker via markSecretsInStorage', async () => {
		const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: {} });
		const s = new LocalStore(p, secrets().store); await s.load();
		s.markSecretsInStorage(); await s.flush();
		expect(p.data).toMatchObject({ secretsInStorage: true });
	});
	it('migrates none markers on load and saves once', async () => {
		const fixture = resolve(fileURLToPath(import.meta.url), '../../fixtures/data-v2-markers.json');
		const p = plugin(JSON.parse(readFileSync(fixture, 'utf8')));
		const saveSpy = vi.spyOn(p, 'saveData');
		const s = new LocalStore(p); await s.load();
		expect(JSON.stringify(s.data.cache)).not.toContain('"none"');
		expect(s.getCache('Movie/Markers Only')?.apiCheck).toMatchObject({
			poster: { result: 'notfound' }, trailer: { result: 'notfound' }, credits: { result: 'notfound' }, studio: { result: 'notfound' },
		});
		await s.flush(); await s.flush();
		expect(saveSpy).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(p.data)).not.toContain('"none"');
	});
	it('leaves a schema-1 file with markers unwritten', async () => {
		const data = { titles: [], cache: { 'Movie/A': { trailerUrl: 'none' } } };
		const p = plugin(data); const saveSpy = vi.spyOn(p, 'saveData');
		const s = new LocalStore(p); await s.load(); await s.flush();
		expect(saveSpy).not.toHaveBeenCalled();
		expect(p.data).toBe(data);
	});
	it('reads a cache entry field by field: wrong-typed fields drop, the entry stays', async () => {
		const cache = {
			'Movie/A': { seasons: 'x', tmdbId: '5', studio: ['S'], director: ['D', 3], collectionId: 7, apiCheck: { credits: { at: '2026-01-01T00:00:00.000Z', result: 'notfound' }, studio: 'bad' } },
			'Movie/B': 'not an entry',
		};
		const p = plugin({ schemaVersion: 2, settings: {}, cache, ui: {} });
		const s = new LocalStore(p); await s.load();
		expect(s.getCache('Movie/A')).toEqual({
			studio: ['S'], director: ['D'], collectionId: 7,
			apiCheck: { credits: { at: '2026-01-01T00:00:00.000Z', result: 'notfound' } },
		});
		expect(s.getCache('Movie/B')).toBeUndefined();
	});
	it('reads valid seasons and airing, and ignores a cache or ui of the wrong kind', async () => {
		const seasons = [{ name: 'S1', episodes: 8, offset: 0 }, { name: 'bad' }];
		const airing = { nextSeason: 2, nextEpisode: 'x', refreshedAt: '2026-02-02T00:00:00.000Z' };
		const p = plugin({ schemaVersion: 2, settings: 'x', cache: { 'TV/A': { seasons, airing, tmdbMediaType: 'tv', communitySource: 5 } }, ui: [] });
		const s = new LocalStore(p); await s.load();
		expect(s.getCache('TV/A')).toEqual({
			seasons: [{ name: 'S1', episodes: 8, offset: 0 }], airing: { nextSeason: 2, refreshedAt: '2026-02-02T00:00:00.000Z' }, tmdbMediaType: 'tv',
		});
		expect(s.data.settings).toEqual({});
		expect(s.data.ui).toEqual({});
		const q = new LocalStore(plugin({ schemaVersion: 2, settings: {}, cache: [] })); await q.load();
		expect(q.data.cache).toEqual({});
	});
	it('reads the ui state field by field and keeps keys it does not know', async () => {
		const ui = {
			collapsedSeasons: { 'TV/A': [1, 'x', 2] }, pinnedGroup: 5, recommendedDaily: { date: '2026-01-01', ids: ['a', 1] },
			gamesRecommendedDaily: { date: 3 }, watchlogImport: { original: 'imported', fork: 'maybe' }, other: 1,
		};
		const p = plugin({ schemaVersion: 2, settings: {}, cache: {}, ui, reading: 'x', games: { a: 1 }, secretsInStorage: 'yes' });
		const s = new LocalStore(p); await s.load();
		expect(s.data.ui).toEqual({
			collapsedSeasons: { 'TV/A': [1, 2] }, recommendedDaily: { date: '2026-01-01', ids: ['a'] }, watchlogImport: { original: 'imported' }, other: 1,
		});
		expect(s.data.ui.pinnedGroup).toBeUndefined();
		expect(s.data.reading).toBeUndefined();
		expect(s.data.games).toEqual({ a: 1 });
		expect(s.data.secretsInStorage).toBeUndefined();
		const q = new LocalStore(plugin({ schemaVersion: 2, settings: {}, cache: {}, ui: { pinnedGroup: null } })); await q.load();
		expect(q.data.ui.pinnedGroup).toBeNull();
	});
});
