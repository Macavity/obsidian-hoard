import { describe, it, expect, vi } from 'vitest';
import { SecretStore, SECRET_SETTINGS, type SecretBackend } from '../../src/storage/SecretStore';

function backend(initial: Record<string, string> = {}) {
	const m = new Map(Object.entries(initial));
	const set = vi.fn((id: string, v: string) => { m.set(id, v); });
	const b: SecretBackend & { m: Map<string, string>; set: typeof set } = {
		m,
		set,
		getSecret: (id) => m.get(id) ?? null,
		setSecret: (id, v) => { set(id, v); },
	};
	return b;
}

describe('SecretStore', () => {
	it('maps all nine settings to hoard-* ids', () => {
		expect(Object.keys(SECRET_SETTINGS).sort()).toEqual(['googleBooksApiKey', 'igdbClientId', 'igdbClientSecret', 'jikanBaseUrl', 'omdbApiKey', 'rawgApiKey', 'steamApiKey', 'steamId', 'tmdbApiKey']);
		for (const id of Object.values(SECRET_SETTINGS)) expect(id).toMatch(/^hoard-[a-z0-9-]+$/);
	});
	it('reads only non-empty values', () => {
		const s = new SecretStore(backend({ 'hoard-tmdb-api-key': 'T', 'hoard-omdb-api-key': '' }));
		expect(s.read()).toEqual({ tmdbApiKey: 'T' });
	});
	it('writes only changed values', () => {
		const b = backend({ 'hoard-tmdb-api-key': 'T' });
		new SecretStore(b).write({ tmdbApiKey: 'T', omdbApiKey: 'O' });
		expect(b.set).toHaveBeenCalledTimes(1);
		expect(b.set).toHaveBeenCalledWith('hoard-omdb-api-key', 'O');
	});
	it('absorbs keys fill-only and removes them from the record', () => {
		const b = backend({ 'hoard-tmdb-api-key': 'KEEP' });
		const rec: Record<string, unknown> = { tmdbApiKey: 'OLD', steamId: '42', omdbApiKey: '', dateFormat: 'dmy' };
		expect(new SecretStore(b).absorb(rec)).toBe(true);
		expect(rec).toEqual({ dateFormat: 'dmy' });
		expect(b.m.get('hoard-tmdb-api-key')).toBe('KEEP');
		expect(b.m.get('hoard-steam-id')).toBe('42');
		expect(b.m.has('hoard-omdb-api-key')).toBe(false);
	});
	it('keeps the key in the record when the secret cannot be stored', () => {
		const b = backend();
		b.setSecret = () => { throw new Error('no storage'); };
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const rec: Record<string, unknown> = { rawgApiKey: 'R' };
		expect(new SecretStore(b).absorb(rec)).toBe(false);
		expect(rec).toEqual({ rawgApiKey: 'R' });
		expect(warn).toHaveBeenCalled();
	});
	it('warns once per key while the storage keeps refusing', () => {
		const b = backend();
		b.setSecret = () => { throw new Error('Secure storage is not available.'); };
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const s = new SecretStore(b);
		for (let i = 0; i < 3; i++) {
			s.absorb({ rawgApiKey: 'R' });
			s.write({ rawgApiKey: 'R' });
		}
		expect(warn).toHaveBeenCalledTimes(1);
	});
	it('keeps the key when the read-back is empty', () => {
		const b = backend();
		b.setSecret = () => {};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const rec: Record<string, unknown> = { rawgApiKey: 'R' };
		new SecretStore(b).absorb(rec);
		expect(rec).toEqual({ rawgApiKey: 'R' });
		expect(warn).toHaveBeenCalled();
	});
	it('reports the keys it could not store', () => {
		const b = backend();
		b.setSecret = (id) => { if (id === 'hoard-rawg-api-key') throw new Error('no storage'); };
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(new SecretStore(b).write({ rawgApiKey: 'R', steamId: '' })).toEqual(['rawgApiKey']);
	});
	it('reports a key whose read-back differs as not stored', () => {
		const b = backend();
		b.setSecret = () => {};
		expect(new SecretStore(b).write({ omdbApiKey: 'O' })).toEqual(['omdbApiKey']);
	});
	it('reports empty storage', () => {
		expect(new SecretStore(backend()).isEmpty()).toBe(true);
		expect(new SecretStore(backend({ 'hoard-steam-id': '1' })).isEmpty()).toBe(false);
	});
});
