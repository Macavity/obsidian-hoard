import { describe, it, expect } from 'vitest';
import { LocalStore } from '../../src/storage/LocalStore';
const plugin = (data: unknown) => { const p = { data, loadData: () => Promise.resolve(p.data), saveData: (d: unknown) => { p.data = d; return Promise.resolve(); } }; return p; };
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
		expect(await s.load()).toEqual({ schema: 2 });
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
});
