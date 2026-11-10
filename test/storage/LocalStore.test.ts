import { describe, it, expect, vi } from 'vitest';
import { LocalStore } from '../../src/storage/LocalStore';
import { SecretStore } from '../../src/storage/SecretStore';
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
		s.setCache('Movie/A', { posterUrl: 'u' }); s.setCache('Movie/A', { trailerUrl: 't' });
		s.renameCache('Movie/A', 'Movie/B');
		expect(s.getCache('Movie/B')).toEqual({ posterUrl: 'u', trailerUrl: 't' });
		s.deleteCache('Movie/B'); await s.flush();
		expect((p.data as { cache: object }).cache).toEqual({});
	});
	it('treats schema-1 data as empty and never overwrites it', async () => {
		const data = { titles: [], groups: [], settings: {} };
		const p = plugin(data); const s = new LocalStore(p);
		expect(await s.load()).toEqual({ schema: 'watchlog' });
		expect(s.isWritable).toBe(false);
		s.setCache('Movie/A', { posterUrl: 'u' });
		await s.flush();
		expect(p.data).toBe(data);
	});
	it('never writes a data.json from a newer version', async () => {
		const newer = { schemaVersion: 3, settings: { x: 1 } };
		const p = plugin(newer); const s = new LocalStore(p);
		expect(await s.load()).toEqual({ schema: 'newer' });
		s.setCache('Movie/A', { posterUrl: 'u' });
		await s.flush();
		expect(p.data).toBe(newer);
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
});
