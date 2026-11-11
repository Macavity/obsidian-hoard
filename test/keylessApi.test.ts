import { requestUrl } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, apiSourceFromUrl } from '../src/ApiService';
import { TENRAI_BASE } from '../src/jikanBase';
import cinemetaSearch from './fixtures/cinemeta-search-series.json';
import cinemetaMeta from './fixtures/cinemeta-meta-series.json';
import openLibrarySearch from './fixtures/openlibrary-search.json';
import openLibraryWork from './fixtures/openlibrary-work.json';
import steamStoreSearch from './fixtures/steamstore-search.json';

const sent = vi.mocked(requestUrl);
function respond(json: unknown) {
	sent.mockResolvedValue({ status: 200, text: JSON.stringify(json), json } as never);
}
function fail(status: number) {
	sent.mockResolvedValue({ status, text: '', json: null } as never);
}
const urlOf = (i = 0) => (sent.mock.calls[i]![0] as { url: string }).url;
const api = () => new ApiService('');

beforeEach(() => sent.mockReset());

describe('cinemeta', () => {
	it('searches without a key', async () => {
		respond(cinemetaSearch);
		const rows = await api().searchCinemeta('breaking bad', 'series');
		expect(urlOf()).toBe('https://v3-cinemeta.strem.io/catalog/series/top/search=breaking%20bad.json');
		expect(rows[0]!.imdbId).toBe('tt0903747');
	});

	it('maps tv to the series meta endpoint', async () => {
		respond(cinemetaMeta);
		const d = await api().getCinemetaDetails('tt0903747', 'tv');
		expect(urlOf()).toBe('https://v3-cinemeta.strem.io/meta/series/tt0903747.json');
		expect(d!.seasons.length).toBe(5);
	});

	it('reports 429 as rate-limited', async () => {
		fail(429);
		await expect(api().searchCinemeta('x', 'movie')).rejects.toMatchObject({ source: 'cinemeta', reason: 'rate-limited' });
	});
});

describe('cinemeta credits', () => {
	const bb = { externalLink: 'https://www.imdb.com/title/tt0903747/', type: 'TV Show', totalEpisodes: 0 } as never;
	const unknownKind = { externalLink: 'https://www.imdb.com/title/tt0903747/', type: 'Doc', totalEpisodes: 0 } as never;

	it('fills credits from the series meta when the source is cinemeta', async () => {
		respond(cinemetaMeta);
		const credits = await api().fetchCredits(bb, 'cinemeta');
		expect(urlOf()).toBe('https://v3-cinemeta.strem.io/meta/series/tt0903747.json');
		expect(credits).toEqual({ director: ['none'], cast: ['Bryan Cranston', 'Aaron Paul', 'Anna Gunn'] });
	});

	it('tries series before movie for an unknown kind', async () => {
		sent.mockResolvedValueOnce({ status: 200, text: '{}', json: {} } as never);
		sent.mockResolvedValueOnce({ status: 200, text: JSON.stringify(cinemetaMeta), json: cinemetaMeta } as never);
		await api().fetchCredits(unknownKind, 'cinemeta');
		expect(urlOf(0)).toContain('/meta/series/');
		expect(urlOf(1)).toContain('/meta/movie/');
	});

	it('lets a network error propagate so nothing is stored as none', async () => {
		fail(429);
		await expect(api().fetchCredits(bb, 'cinemeta')).rejects.toMatchObject({ source: 'cinemeta' });
	});

	it('returns null when cinemeta knows neither kind', async () => {
		respond({});
		expect(await api().fetchCredits(unknownKind, 'cinemeta')).toBeNull();
	});
});

describe('open library', () => {
	it('searches and loads a work', async () => {
		respond(openLibrarySearch);
		const rows = await api().searchOpenLibrary('the hobbit');
		expect(urlOf()).toContain('https://openlibrary.org/search.json?q=the%20hobbit');
		expect(rows[0]!.title).toBe('The Hobbit');
		respond(openLibraryWork);
		const work = await api().getOpenLibraryWork('OL27482W');
		expect(urlOf(1)).toBe('https://openlibrary.org/works/OL27482W.json');
		expect(work!.title).toBe('The Hobbit');
	});

	it('returns null for an empty id without a request', async () => {
		expect(await api().getOpenLibraryWork('')).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});

	it('reports 500 as server', async () => {
		fail(500);
		await expect(api().searchOpenLibrary('x')).rejects.toMatchObject({ source: 'openLibrary', reason: 'server' });
	});
});

describe('steam store', () => {
	it('searches', async () => {
		respond(steamStoreSearch);
		const rows = await api().searchSteamStore('hades');
		expect(urlOf()).toContain('https://store.steampowered.com/api/storesearch/?term=hades');
		expect(rows.some((r) => r.title === 'Hades II')).toBe(true);
	});

	it('reports 429 as rate-limited', async () => {
		fail(429);
		await expect(api().searchSteamStore('hades')).rejects.toMatchObject({ source: 'steamStore', reason: 'rate-limited' });
	});

	it('combines search row and appdetails', async () => {
		const row = (await (async () => { respond(steamStoreSearch); return api().searchSteamStore('hades'); })())[0]!;
		respond({ [String(row.id)]: { success: true, data: { name: 'Hades II', developers: ['Supergiant'], publishers: ['Supergiant'], genres: [{ description: 'Action' }], release_date: { date: '25 Sep, 2024' }, categories: [{ id: 2 }] } } });
		const d = await api().getSteamStoreDetails(row);
		expect(d).toMatchObject({ id: row.id, developer: 'Supergiant', singleplayer: true });
	});

	it('returns null when appdetails fail', async () => {
		respond({ '1': { success: false } });
		expect(await api().getSteamStoreDetails({ source: 'steam', id: 1, title: 'x', releaseDate: '', coverUrl: '', platforms: [], url: '' })).toBeNull();
	});
});

describe('apiSourceFromUrl', () => {
	it('recognises the keyless hosts', () => {
		expect(apiSourceFromUrl('https://v3-cinemeta.strem.io/x', TENRAI_BASE)).toBe('cinemeta');
		expect(apiSourceFromUrl('https://openlibrary.org/x', TENRAI_BASE)).toBe('openLibrary');
		expect(apiSourceFromUrl('https://covers.openlibrary.org/x', TENRAI_BASE)).toBe('openLibrary');
		expect(apiSourceFromUrl('https://store.steampowered.com/api/storesearch/?term=a', TENRAI_BASE)).toBe('steamStore');
		expect(apiSourceFromUrl('https://store.steampowered.com/api/appdetails?appids=1', TENRAI_BASE)).toBe('unknown');
	});
});
