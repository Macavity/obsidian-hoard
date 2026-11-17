import { describe, it, expect } from 'vitest';
import { migrateNoneMarkers } from '../../src/storage/cacheMigration';

const AT = '2026-11-16T00:00:00.000Z';
const miss = { at: AT, result: 'notfound' };

describe('migrateNoneMarkers', () => {
	it('turns a poster marker into a notfound check and drops posterUrl', () => {
		const r = migrateNoneMarkers({ a: { posterUrl: 'none', tmdbId: 1 } }, AT);
		expect(r.changed).toBe(true);
		expect(r.cache).toEqual({ a: { tmdbId: 1, apiCheck: { poster: miss } } });
	});

	it('drops a posterUrl that is not a marker without a check', () => {
		const r = migrateNoneMarkers({ a: { posterUrl: 'https://x/p.jpg' } }, AT);
		expect(r.changed).toBe(true);
		expect(r.cache).toEqual({ a: {} });
	});

	it('turns a trailer marker into a notfound check', () => {
		const r = migrateNoneMarkers({ a: { trailerUrl: 'none' } }, AT);
		expect(r.cache).toEqual({ a: { apiCheck: { trailer: miss } } });
	});

	it('turns a director or cast marker into a credits check and keeps the other list', () => {
		const r = migrateNoneMarkers({ a: { director: ['none'], cast: ['Amy Adams'] }, b: { cast: ['none'] } }, AT);
		expect(r.cache).toEqual({ a: { cast: ['Amy Adams'], apiCheck: { credits: miss } }, b: { apiCheck: { credits: miss } } });
	});

	it('turns a studio marker into a notfound check', () => {
		const r = migrateNoneMarkers({ a: { studio: ['none'] } }, AT);
		expect(r.cache).toEqual({ a: { apiCheck: { studio: miss } } });
	});

	it('returns an entry without markers unchanged', () => {
		const cache = { a: { trailerUrl: 'https://youtu.be/x', director: ['Me'], apiCheck: { airing: { at: AT, result: 'ok' } } } };
		const r = migrateNoneMarkers(cache, AT);
		expect(r.changed).toBe(false);
		expect(r.cache).toBe(cache);
	});

	it('keeps an existing check instead of overwriting it', () => {
		const transient = { at: '2026-11-01T00:00:00.000Z', result: 'transient' };
		const r = migrateNoneMarkers({ a: { trailerUrl: 'none', apiCheck: { trailer: transient, seasons: { at: AT, result: 'ok' } } } }, AT);
		expect(r.cache).toEqual({ a: { apiCheck: { trailer: transient, seasons: { at: AT, result: 'ok' } } } });
	});

	it('does not mutate its input', () => {
		const cache = { a: { posterUrl: 'none', trailerUrl: 'none' } };
		migrateNoneMarkers(cache, AT);
		expect(cache).toEqual({ a: { posterUrl: 'none', trailerUrl: 'none' } });
	});

	it('passes entries of the wrong shape through', () => {
		const r = migrateNoneMarkers({ a: null, b: 5, c: { trailerUrl: 'none' } }, AT);
		expect(r.cache).toEqual({ a: null, b: 5, c: { apiCheck: { trailer: miss } } });
	});
});
