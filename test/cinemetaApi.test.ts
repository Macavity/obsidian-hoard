import { describe, expect, it } from 'vitest';
import search from './fixtures/cinemeta-search-series.json';
import series from './fixtures/cinemeta-meta-series.json';
import movie from './fixtures/cinemeta-meta-movie.json';
import { cinemetaSearchUrl, cinemetaMetaUrl, mapCinemetaMeta, mapCinemetaSearch } from '../src/cinemetaApi';

describe('cinemeta', () => {
	it('builds urls', () => {
		expect(cinemetaSearchUrl('series', 'breaking bad'))
			.toBe('https://v3-cinemeta.strem.io/catalog/series/top/search=breaking%20bad.json');
		expect(cinemetaMetaUrl('movie', 'tt0133093')).toBe('https://v3-cinemeta.strem.io/meta/movie/tt0133093.json');
	});
	it('maps search rows to imdb-keyed results', () => {
		const rows = mapCinemetaSearch(search, 'series', '', 9);
		expect(rows[0]).toMatchObject({ imdbId: 'tt0903747', title: 'Breaking Bad', mediaType: 'tv',
			url: 'https://www.imdb.com/title/tt0903747/', episodes: 0, seasons: [], releaseDate: '2008' });
		expect(rows[0]!.posterUrl).toMatch(/^https:\/\//);
	});
	it('filters by a 4-digit year and respects the limit', () => {
		expect(mapCinemetaSearch(search, 'series', '2009', 9).some((r) => r.imdbId === 'tt0903747')).toBe(false);
		expect(mapCinemetaSearch(search, 'series', '2008', 9).some((r) => r.imdbId === 'tt0903747')).toBe(true);
		expect(mapCinemetaSearch(search, 'series', '', 1)).toHaveLength(1);
	});
	it('maps series meta with seasons and runtime', () => {
		const m = mapCinemetaMeta(series, 'series')!;
		expect(m.releaseDate).toBe('2008-01-20');
		expect(m.episodeDuration).toBe(49);
		expect(m.seasons.length).toBe(5);
		expect(m.episodes).toBe(62);
		expect(m.cast).toContain('Bryan Cranston');
	});
	it('maps movie meta', () => {
		const m = mapCinemetaMeta(movie, 'movie')!;
		expect(m).toMatchObject({ imdbId: 'tt0133093', mediaType: 'movie', episodes: 1, seasons: [] });
		expect(m.episodeDuration).toBeGreaterThan(0);
	});
	it('parses runtimes', () => {
		const dur = (runtime: unknown) => mapCinemetaMeta({ meta: { id: 'tt1', name: 'x', runtime } }, 'movie')!.episodeDuration;
		expect(dur('2h 5min')).toBe(125);
		expect(dur('49 min')).toBe(49);
		expect(dur('soon')).toBe(0);
		expect(dur(undefined)).toBe(0);
	});
	it('returns [] / null for garbage', () => {
		expect(mapCinemetaSearch(null, 'movie', '', 9)).toEqual([]);
		expect(mapCinemetaSearch({ metas: [{ id: 'kitsu:1', name: 'x' }] }, 'movie', '', 9)).toEqual([]);
		expect(mapCinemetaMeta({ meta: null }, 'movie')).toBeNull();
		expect(mapCinemetaMeta('x', 'movie')).toBeNull();
		expect(mapCinemetaMeta({ meta: { id: 'nope', name: 'x' } }, 'movie')).toBeNull();
	});
});
