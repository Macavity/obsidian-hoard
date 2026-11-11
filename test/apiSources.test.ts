import { describe, expect, it } from 'vitest';
import { ApiService } from '../src/ApiService';
import { effectiveBookSource, effectiveGameSource, effectiveMediaSource } from '../src/apiSources';

const keys = (has: Partial<Record<'omdb' | 'tmdb' | 'google' | 'rawg' | 'igdb', boolean>>) => ({
	hasOmdbKey: () => !!has.omdb, hasTmdbKey: () => !!has.tmdb, hasGoogleBooksKey: () => !!has.google,
	hasRawgKey: () => !!has.rawg, hasIgdbCredentials: () => !!has.igdb,
});

describe('effectiveMediaSource', () => {
	it.each([
		['Cinemeta', {}, 'cinemeta'],
		['OMDb', {}, 'cinemeta'],
		['OMDb', { omdb: true }, 'omdb'],
		['TMDB', { omdb: true }, 'cinemeta'],
		['TMDB', { tmdb: true }, 'tmdb'],
		[undefined, { tmdb: true }, 'cinemeta'],
	] as const)('%s with %o → %s', (activeApi, has, want) => {
		expect(effectiveMediaSource({ activeApi } as never, keys(has))).toBe(want);
	});
});
describe('effectiveBookSource', () => {
	it.each([['openlibrary', {}, 'openlibrary'], ['google', {}, 'openlibrary'], ['google', { google: true }, 'google']] as const)(
		'%s with %o → %s', (booksApiSource, has, want) => {
			expect(effectiveBookSource({ booksApiSource }, keys(has))).toBe(want);
		});
});
describe('effectiveGameSource', () => {
	it.each([['steam', {}, 'steam'], ['rawg', {}, 'steam'], ['rawg', { rawg: true }, 'rawg'], ['igdb', { rawg: true }, 'steam'], ['igdb', { igdb: true }, 'igdb']] as const)(
		'%s with %o → %s', (gamesApiSource, has, want) => {
			expect(effectiveGameSource({ gamesApiSource }, keys(has))).toBe(want);
		});
});

describe('ApiService.hasOmdbKey', () => {
	it.each([['', false], ['   ', false], ['abc', true]])('%j → %s', (key, want) => {
		expect(ApiService.prototype.hasOmdbKey.call({ omdbApiKey: key })).toBe(want);
	});
});
