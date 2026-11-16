import { requestUrl } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, apiErrorMessage, apiErrorShort, requestVia } from '../src/ApiService';
import type { JikanEndpoint } from '../src/jikanBase';
import type { HoardTitle } from '../src/types';
import anilistMedia from './fixtures/anilist-media.json';
import anilistSearch from './fixtures/anilist-search.json';
import jikanAnime from './fixtures/jikan-anime.json';
import omdbMovie from './fixtures/omdb-detail-movie.json';
import omdbSearch from './fixtures/omdb-search.json';
import omdbSeason from './fixtures/omdb-season.json';
import omdbSeries from './fixtures/omdb-detail-series.json';
import tmdbExternalIds from './fixtures/tmdb-external-ids.json';
import tmdbFind from './fixtures/tmdb-find.json';
import tmdbMovie from './fixtures/tmdb-movie-detail.json';
import tmdbSearch from './fixtures/tmdb-search.json';
import tmdbTv from './fixtures/tmdb-tv-detail.json';

const sent = vi.mocked(requestUrl);
const ok = (json: unknown) => ({ status: 200, text: JSON.stringify(json), json }) as never;
const reply = (code: number, text = '') => ({ status: code, text, json: null }) as never;

/** Answers by URL part: the first matching route wins; an Error rejects, a number is an HTTP status, anything unmatched is offline. */
function route(routes: Array<[string, unknown]>) {
	sent.mockImplementation(((p: { url: string }) => {
		const hit = routes.find(([part]) => p.url.includes(part));
		if (!hit) return Promise.reject(new Error('offline'));
		if (hit[1] instanceof Error) return Promise.reject(hit[1]);
		if (typeof hit[1] === 'number') return Promise.resolve(reply(hit[1]));
		return Promise.resolve(ok(hit[1]));
	}) as never);
}
const respond = (json: unknown) => sent.mockResolvedValue(ok(json));

const title = (over: Partial<HoardTitle>): HoardTitle => ({
	id: 't1', title: 'X', type: 'Movie', status: '', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 100,
	releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [], ...over,
});

const ids = (over: Partial<HoardTitle>) => ({ externalLink: '', ...over });
const omdb = () => new ApiService('okey');
const tmdb = () => new ApiService('', 'tkey');
const anime = () => new ApiService('');
const caught = async (p: Promise<unknown>): Promise<unknown> => {
	try { await p; } catch (e) { return e; }
	return null;
};

beforeEach(() => { sent.mockReset(); });

describe('error classification', () => {
	type Row = [string, () => Promise<unknown>, unknown, string, string, string];
	const rows: Row[] = [
		['tmdb 401', () => tmdb().checkTmdbConnection(), reply(401), 'auth', 'TMDB rejected this credential', 'Credential rejected'],
		['tmdb 403', () => tmdb().checkTmdbConnection(), reply(403), 'auth', 'TMDB rejected this credential', 'Credential rejected'],
		['tmdb 404', () => tmdb().checkTmdbConnection(), reply(404), 'not-found', 'TMDB had no match', 'Not found'],
		['tmdb 429', () => tmdb().checkTmdbConnection(), reply(429), 'rate-limited', 'TMDB is rate-limiting requests', 'Rate limited'],
		['tmdb 500', () => tmdb().checkTmdbConnection(), reply(500), 'server', 'TMDB is temporarily unavailable (HTTP 500). This is not your key', 'Service unavailable'],
		['tmdb 418', () => tmdb().checkTmdbConnection(), reply(418), 'http', 'TMDB request failed (HTTP 418).', 'Failed (HTTP 418)'],
		['omdb 401 quota', () => omdb().checkOmdbConnection(), reply(401, '{"Error":"Request limit reached!"}'), 'rate-limited', 'OMDb daily request limit', 'Rate limited'],
		['omdb 401, provider text does not replace our wording', () => omdb().checkOmdbConnection(), reply(401, '{"message":"nope"}'), 'auth', 'OMDb rejected the key', 'Credential rejected'],
		['omdb 403 key', () => omdb().checkOmdbConnection(), reply(403, 'Invalid API key!'), 'auth', 'OMDb rejected the key', 'Credential rejected'],
		['jikan 403', () => anime().pingJikan(), reply(403), 'server', 'MyAnimeList is temporarily unavailable (HTTP 403). Try again shortly.', 'Service unavailable'],
		['jikan 429', () => anime().pingJikan(), reply(429), 'rate-limited', 'MyAnimeList API is rate-limiting', 'Rate limited'],
		['jikan upstream message', () => anime().pingJikan(), reply(502, '{"message":"MyAnimeList is down"}'), 'server', 'MyAnimeList: MyAnimeList is down.', 'Service unavailable'],
		['books 403 disabled', () => new ApiService('', '', 'gk').checkGoogleBooksConnection(), reply(403, '{"reason":"accessNotConfigured"}'), 'not-enabled', 'Books API is not enabled', 'API not enabled'],
		['books 403 quota', () => new ApiService('', '', 'gk').checkGoogleBooksConnection(), reply(403, 'userRateLimitExceeded'), 'rate-limited', 'Google Books quota exceeded', 'Rate limited'],
		['books 403 key', () => new ApiService('', '', 'gk').checkGoogleBooksConnection(), reply(403, 'forbidden'), 'auth', 'Google rejected this key', 'Credential rejected'],
		['books 401', () => new ApiService('', '', 'gk').checkGoogleBooksConnection(), reply(401), 'auth', 'Google rejected this key', 'Credential rejected'],
		['tmdb no key', () => new ApiService('').checkTmdbConnection(), reply(200), 'no-key', 'TMDB token required', 'No key set'],
		['omdb no key', () => new ApiService('').checkOmdbConnection(), reply(200), 'no-key', 'OMDb API key required', 'No key set'],
		['anilist 500, body is not JSON', () => anime().searchAniList('x'), reply(500, '{'), 'server', 'AniList is temporarily unavailable (HTTP 500). Try again shortly.', 'Service unavailable'],
		['anilist 500, body is null', () => anime().searchAniList('x'), reply(500, 'null'), 'server', 'AniList is temporarily unavailable (HTTP 500)', 'Service unavailable'],
		['anilist 500, errors is a string', () => anime().searchAniList('x'), reply(500, '{"errors":"x"}'), 'server', 'AniList is temporarily unavailable (HTTP 500)', 'Service unavailable'],
		['anilist 500, errors without message', () => anime().searchAniList('x'), reply(500, '{"errors":[{}]}'), 'server', 'AniList is temporarily unavailable (HTTP 500)', 'Service unavailable'],
		['anilist 500, graphql message', () => anime().searchAniList('x'), reply(500, '{"errors":[{"message":"  Boom  "}]}'), 'server', 'AniList: Boom.', 'Service unavailable'],
		['anilist 500, top-level message', () => anime().searchAniList('x'), reply(500, '{"errors":[{}],"message":"top."}'), 'server', 'AniList: top.', 'Service unavailable'],
		['anilist 200, rate limit in errors', () => anime().searchAniList('x'), ok({ errors: [{ message: 'Too Many Requests.' }] }), 'rate-limited', 'AniList is rate-limiting', 'Rate limited'],
		['anilist 200, other errors', () => anime().searchAniList('x'), ok({ errors: [{ message: 'Bad query' }] }), 'http', 'AniList: Bad query.', 'Failed (HTTP ?)'],
		['anilist 200, errors without message', () => anime().searchAniList('x'), ok({ errors: [{}] }), 'http', 'AniList: Request rejected.', 'Failed (HTTP ?)'],
		['omdb 200, bad key', () => omdb().searchOmdb('x', 'movie'), ok({ Response: 'False', Error: 'Invalid API key!' }), 'auth', 'OMDb rejected the key', 'Credential rejected'],
		['omdb 200, quota', () => omdb().searchOmdb('x', 'movie'), ok({ Response: 'False', Error: 'Request limit reached!' }), 'rate-limited', 'OMDb daily request limit', 'Rate limited'],
		['network', () => tmdb().checkTmdbConnection(), new Error('boom'), 'network', 'TMDB is unreachable', 'Unreachable'],
		['network, thrown without a message', () => tmdb().checkTmdbConnection(), { thrown: true }, 'network', 'TMDB is unreachable', 'Unreachable'],
		['unreadable body', () => tmdb().checkTmdbConnection(), { status: 200, text: '', get json(): unknown { throw new Error('bad json'); } }, 'parse', 'TMDB returned an unreadable response', 'Unreadable response'],
	];

	it.each(rows)('%s', async (_name, call, response, reason, message, short) => {
		if (response instanceof Error || (response as { thrown?: boolean }).thrown) sent.mockRejectedValue(response);
		else sent.mockResolvedValue(response as never);
		const err = await caught(call());
		expect(err).toMatchObject({ reason });
		expect(apiErrorMessage(err)).toContain(message);
		expect(apiErrorShort(err)).toBe(short);
	});

	it('treats anything but an ApiError as a plain failed request', () => {
		expect(apiErrorMessage(new Error('x'))).toBe('Request failed; check your connection.');
		expect(apiErrorShort(null)).toBe('Failed');
	});

	it('ignores a GraphQL errors field that is not a non-empty list', async () => {
		for (const errors of ['x', [], null, 5]) {
			respond({ errors, data: { Page: { media: [] } } });
			expect(await anime().searchAniList('x')).toEqual([]);
		}
	});

	it('reads a rejected Jikan login as auth, not an outage', async () => {
		const jikan: JikanEndpoint = { base: 'https://jikan.example/v4', headers: { Authorization: 'Basic abc' } };
		sent.mockResolvedValue(reply(401));
		await expect(requestVia(jikan, { url: 'https://jikan.example/v4/anime/1' })).rejects.toMatchObject({ source: 'jikan', reason: 'auth', status: 401 });
		await expect(requestVia({ base: jikan.base, headers: {} }, { url: 'https://jikan.example/v4/anime/1' })).rejects.toMatchObject({ reason: 'server' });
	});
});

describe('AniList', () => {
	it('maps a real search page', async () => {
		respond(anilistSearch);
		expect(await anime().searchAniList('bebop', '1998')).toEqual([{
			malId: 0,
			anilistId: 1,
			title: 'Cowboy Bebop',
			episodes: 26,
			duration: 24,
			releaseDate: '1998-04-03',
			url: 'https://anilist.co/anime/1',
			seasons: [{ name: 'Season 1', episodes: 26, offset: 0 }],
			description: 'Spike & Jet\nchase bounties.',
			averageScore: 86,
			genres: ['Action', 'Sci-Fi'],
			posterUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg',
			trailerUrl: 'https://www.youtube.com/watch?v=qig4KOK2R2g',
		}]);
	});

	it('builds a row with empty values from wrong-typed fields and drops rows that are not records', async () => {
		respond({ data: { Page: { media: [null, 5, 'x', {
			id: 'x', title: 5, episodes: '26', duration: 'long', startDate: { year: '1998' }, averageScore: '86',
			coverImage: null, description: 7, genres: 'Action', trailer: 'x',
		}] } } });
		expect(await anime().searchAniList('x')).toEqual([{
			malId: 0, anilistId: 0, title: '', episodes: 0, duration: 24, releaseDate: '', url: 'https://anilist.co/anime/0',
			seasons: [], description: '', averageScore: undefined, genres: undefined, posterUrl: undefined, trailerUrl: undefined,
		}]);
	});

	it('falls back through the title names and the date parts', async () => {
		respond({ data: { Page: { media: [
			{ id: 2, title: { english: '', romaji: 'Romaji', native: 'N' }, startDate: { year: 2001 }, coverImage: { medium: 'https://m/1.jpg' }, description: '' },
			{ id: 3, title: { native: 'Native' }, coverImage: { large: 'http://insecure/1.jpg' } },
		] } } });
		const [a, b] = await anime().searchAniList('x');
		expect(a).toMatchObject({ title: 'Romaji', releaseDate: '2001-01-01', posterUrl: 'https://m/1.jpg' });
		expect(b).toMatchObject({ title: 'Native', posterUrl: undefined });
	});

	it('returns no rows when data is missing or wrong-typed', async () => {
		for (const body of [null, 'x', { data: null }, { data: { Page: { media: 'x' } } }]) {
			respond(body);
			expect(await anime().searchAniList('x')).toEqual([]);
		}
	});

	it('reports the airing pointer of a running show', async () => {
		respond({ data: { Media: { id: 1, nextAiringEpisode: { episode: 5, airingAt: 1700000000 } } } });
		const r = await anime().fetchAiring({ anilistId: 1 });
		expect(r).toMatchObject({ status: 'found', value: { nextEpisode: 5, nextAirDate: '2023-11-14T22:13:20.000Z', lastEpisode: 4 } });
	});

	it('reports the last episode of a finished show', async () => {
		respond(anilistMedia);
		expect(await anime().fetchAiring({ anilistId: 1 })).toMatchObject({ status: 'found', value: { lastEpisode: 26 } });
	});

	it('reports an empty pointer for wrong-typed airing fields', async () => {
		respond({ data: { Media: { id: 1, status: 5, episodes: '3', nextAiringEpisode: 'x' } } });
		const r = await anime().fetchAiring({ anilistId: 1 });
		expect(r).toMatchObject({ status: 'found' });
		expect(r.status === 'found' && Object.keys(r.value)).toEqual(['refreshedAt']);
	});

	it('is notfound when AniList has no such media, and failed when the request fails', async () => {
		respond({ data: { Media: null } });
		expect(await anime().fetchAiring({ anilistId: 1 })).toEqual({ status: 'notfound' });
		sent.mockRejectedValue(new Error('offline'));
		expect(await anime().fetchAiring({ anilistId: 1 })).toEqual({ status: 'failed' });
	});
});

describe('Jikan', () => {
	it('maps a real search page', async () => {
		respond({ data: [jikanAnime.data], pagination: jikanAnime.pagination });
		expect(await anime().searchAnime('bebop', '1998')).toEqual([{
			malId: 1,
			title: 'Cowboy Bebop',
			episodes: 26,
			duration: 24,
			releaseDate: '1998-04-03',
			url: 'https://myanimelist.net/anime/1/Cowboy_Bebop',
			seasons: [{ name: 'Season 1', episodes: 26, offset: 0 }],
			posterUrl: 'https://cdn.myanimelist.net/images/anime/4/19644l.jpg',
			trailerUrl: 'https://www.youtube.com/watch?v=qig4KOK2R2g',
		}]);
	});

	it('builds a row with empty values from wrong-typed fields', async () => {
		respond({ data: [null, 'x', {
			mal_id: '1', title: 5, title_english: null, episodes: '26', duration: 5, aired: 'x', images: { jpg: 'x' }, trailer: 'x', url: 5,
		}], pagination: 'x' });
		expect(await anime().searchAnime('x')).toEqual([{
			malId: 0, title: '', episodes: 0, duration: 24, releaseDate: '', url: '', seasons: [], posterUrl: undefined, trailerUrl: undefined,
		}]);
	});

	it('takes the duration from "N min" and the English title when there is one', async () => {
		respond({ data: [{ mal_id: 2, title: 'Jp', title_english: 'En', duration: '1 hr 30 min', images: { jpg: { image_url: 'https://i/1.jpg' } } }] });
		expect((await anime().searchAnime('x'))[0]).toMatchObject({ title: 'En', duration: 30, posterUrl: 'https://i/1.jpg' });
	});

	it('pages until the limit and stops on the last page', async () => {
		const page = Array.from({ length: 25 }, (_, i) => ({ mal_id: i + 1, title: `T${i}` }));
		respond({ data: page, pagination: { has_next_page: true } });
		expect(await anime().searchAnime('x', undefined, 50)).toHaveLength(50);
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('returns no rows when data is missing', async () => {
		respond({ data: 'x' });
		expect(await anime().searchAnime('x')).toEqual([]);
	});

	it('reads the broadcast slot', async () => {
		respond(jikanAnime);
		expect(await anime().getAnimeScheduleByMalId(1)).toEqual({ dayOfWeek: 6, time: '01:00' });
	});

	it('has no slot for a missing, unknown or wrong-typed broadcast', async () => {
		for (const broadcast of [null, 'x', { day: 'Someday', time: '01:00' }, { day: 'Mondays', time: 5 }, { day: null, time: null }]) {
			respond({ data: { broadcast } });
			expect(await anime().getAnimeScheduleByMalId(1)).toBeNull();
		}
		sent.mockRejectedValue(new Error('offline'));
		expect(await anime().getAnimeScheduleByMalId(1)).toBeNull();
	});

	it('pings the endpoint', async () => {
		respond({ data: { mal_id: 1 } });
		expect(await anime().pingJikan()).toBe(true);
		respond({ data: 'x' });
		expect(await anime().pingJikan()).toBe(false);
	});
});

describe('OMDb', () => {
	it('maps a real search page', async () => {
		respond(omdbSearch);
		expect(await omdb().searchOmdb('inception', 'movie', '2010')).toEqual([
			{ imdbId: 'tt1375666', title: 'Inception', mediaType: 'movie', episodes: 0, episodeDuration: 0, releaseDate: '2010',
				url: 'https://www.imdb.com/title/tt1375666', seasons: [], posterUrl: 'https://m.media-amazon.com/images/M/inception.jpg' },
			{ imdbId: 'tt5295894', title: 'Inception: The Cobol Job', mediaType: 'movie', episodes: 0, episodeDuration: 0, releaseDate: '2010',
				url: 'https://www.imdb.com/title/tt5295894', seasons: [], posterUrl: undefined },
		]);
	});

	it('builds a row with empty values from wrong-typed fields and ends at "not found"', async () => {
		respond({ Response: 'True', Search: [5, { Title: 5, imdbID: null, Year: 2010, Poster: 7 }], totalResults: 5 });
		expect(await omdb().searchOmdb('x', 'series')).toEqual([{
			imdbId: '', title: '', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '',
			url: 'https://www.imdb.com/title/', seasons: [], posterUrl: undefined,
		}]);
		respond({ Response: 'False', Error: 'Movie not found!' });
		expect(await omdb().searchOmdb('x', 'movie')).toEqual([]);
		respond({ Response: 'False', Error: 5 });
		expect(await omdb().searchOmdb('x', 'movie')).toEqual([]);
	});

	it('pages while there are more results', async () => {
		const full = { Response: 'True', totalResults: '25', Search: Array.from({ length: 10 }, (_, i) => ({ Title: `T${i}`, imdbID: `tt${i}`, Year: '2000' })) };
		respond(full);
		expect(await omdb().searchOmdb('x', 'movie')).toHaveLength(27);
		expect(sent).toHaveBeenCalledTimes(3);
	});

	it('needs a key', async () => {
		await expect(new ApiService('').searchOmdb('x', 'movie')).rejects.toMatchObject({ reason: 'no-key' });
		expect(await new ApiService('').getOmdbMovieDetails('tt1')).toBeNull();
		expect(await new ApiService('').getOmdbTvDetails('tt1')).toBeNull();
		expect(await new ApiService('').getOmdbByImdbId('tt1')).toBeNull();
	});

	it('maps real movie details', async () => {
		respond(omdbMovie);
		expect(await omdb().getOmdbMovieDetails('tt1375666')).toEqual({
			imdbId: 'tt1375666', title: 'Inception', mediaType: 'movie', episodes: 1, episodeDuration: 148, releaseDate: '2010-07-16',
			url: 'https://www.imdb.com/title/tt1375666', seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
			director: ['Christopher Nolan'], cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'],
		});
	});

	it('builds movie details with empty values from wrong-typed fields', async () => {
		respond({ Response: 'True', imdbID: 'tt1', Title: 5, Runtime: 5, Released: 5, Year: 'N/A', Director: ['x'], Actors: 7 });
		expect(await omdb().getOmdbMovieDetails('tt1')).toMatchObject({
			imdbId: 'tt1', title: '', episodeDuration: 120, releaseDate: 'N/A', director: [], cast: [],
		});
	});

	it('has no details for a missing title or a record without an id, and rethrows a rejected key', async () => {
		respond({ Response: 'False', Error: 'Incorrect IMDb ID.' });
		expect(await omdb().getOmdbMovieDetails('tt1')).toBeNull();
		respond({ Response: 'True' });
		expect(await omdb().getOmdbTvDetails('tt1')).toBeNull();
		respond({ Response: 'False', Error: 'Invalid API key!' });
		await expect(omdb().getOmdbMovieDetails('tt1')).rejects.toMatchObject({ reason: 'auth' });
		sent.mockRejectedValue(new Error('offline'));
		expect(await omdb().getOmdbMovieDetails('tt1')).toBeNull();
	});

	it('maps real series details with one request per season', async () => {
		route([['Season=', omdbSeason], ['omdbapi.com', omdbSeries]]);
		expect(await omdb().getOmdbTvDetails('tt0903747')).toEqual({
			imdbId: 'tt0903747', title: 'Breaking Bad', mediaType: 'tv', episodes: 4, episodeDuration: 45, releaseDate: '2008-01-20',
			url: 'https://www.imdb.com/title/tt0903747',
			seasons: [{ name: 'Season 1', episodes: 2, offset: 0 }, { name: 'Season 2', episodes: 2, offset: 2 }],
			director: ['Vince Gilligan'], cast: ['Bryan Cranston', 'Aaron Paul', 'Anna Gunn'],
		});
	});

	it('copes with wrong-typed series fields and failing season requests', async () => {
		route([['Season=', { Response: 'True', Episodes: 'x' }], ['omdbapi.com', { ...omdbSeries, totalSeasons: '5', Writer: 7, Director: 'Jane Doe' }]]);
		const r = await omdb().getOmdbTvDetails('tt1');
		expect(r).toMatchObject({ episodes: 0, director: ['Jane Doe'] });
		expect(r?.seasons).toHaveLength(5);
		route([['Season=', { Response: 'False' }], ['omdbapi.com', omdbSeries]]);
		expect((await omdb().getOmdbTvDetails('tt1'))?.seasons).toEqual([]);
		route([['Season=', new Error('offline')], ['omdbapi.com', { ...omdbSeries, totalSeasons: 'many' }]]);
		expect((await omdb().getOmdbTvDetails('tt1'))?.seasons).toEqual([]);
	});

	it('picks movie or tv details by the record type', async () => {
		route([['Season=', omdbSeason], ['omdbapi.com', omdbMovie]]);
		expect((await omdb().getOmdbByImdbId('tt1375666'))?.mediaType).toBe('movie');
		route([['Season=', omdbSeason], ['omdbapi.com', omdbSeries]]);
		expect((await omdb().getOmdbByImdbId('tt0903747'))?.mediaType).toBe('tv');
		respond({ Response: 'False' });
		expect(await omdb().getOmdbByImdbId('tt1')).toBeNull();
	});

	it('checks the connection against a known title', async () => {
		respond(omdbMovie);
		expect(await omdb().checkOmdbConnection()).toBe(true);
		respond({ Response: 'False', Error: 'Movie not found!' });
		expect(await omdb().checkOmdbConnection()).toBe(false);
	});
});

describe('TMDB', () => {
	it('maps a real search page', async () => {
		respond(tmdbSearch);
		expect(await tmdb().searchTmdb('inception', 'movie', '2010')).toEqual([
			{ imdbId: '27205', title: 'Inception', mediaType: 'movie', episodes: 0, episodeDuration: 0, releaseDate: '2010-07-15', url: '', seasons: [],
				posterUrl: 'https://image.tmdb.org/t/p/w342/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg' },
			{ imdbId: '64956', title: 'Inception: The Cobol Job', mediaType: 'movie', episodes: 0, episodeDuration: 0, releaseDate: '2010-12-07', url: '', seasons: [],
				posterUrl: undefined },
		]);
	});

	it('builds a row with empty values from wrong-typed fields', async () => {
		respond({ total_pages: 'many', results: [null, { id: 'x', title: 5, name: 5, release_date: 5, poster_path: 5 }] });
		expect(await tmdb().searchTmdb('x', 'series')).toEqual([{
			imdbId: '0', title: '', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '', url: '', seasons: [], posterUrl: undefined,
		}]);
	});

	it('uses the series name and first air date, and pages up to total_pages', async () => {
		respond({ total_pages: 2, results: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `S${i}`, first_air_date: '2020-01-01' })) });
		const rows = await tmdb().searchTmdb('x', 'series', '2020');
		expect(rows).toHaveLength(27);
		expect(rows[0]).toMatchObject({ title: 'S0', releaseDate: '2020-01-01' });
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('needs a key', async () => {
		await expect(new ApiService('').searchTmdb('x', 'movie')).rejects.toMatchObject({ reason: 'no-key' });
		expect(await new ApiService('').getTmdbMovieDetails('1')).toBeNull();
		expect(await new ApiService('').getTmdbTvDetails('1')).toBeNull();
		expect(await new ApiService('').searchTmdbMovieId('x')).toBeNull();
		expect(await new ApiService('').getTmdbCollection(1)).toBeNull();
	});

	it('maps real movie details', async () => {
		route([['external_ids', tmdbExternalIds], ['themoviedb.org', tmdbMovie]]);
		expect(await tmdb().getTmdbMovieDetails('27205')).toEqual({
			imdbId: '27205', title: 'Inception', mediaType: 'movie', episodes: 1, episodeDuration: 148, releaseDate: '2010-07-15',
			url: 'https://www.imdb.com/title/tt1375666', seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
			trailerUrl: 'https://www.youtube.com/watch?v=YoHD9XEInc0', studio: ['Legendary Pictures', 'Syncopy'],
			director: ['Christopher Nolan'], cast: ['Leonardo DiCaprio', 'Joseph Gordon-Levitt'],
		});
	});

	it('builds movie details with empty values from wrong-typed fields', async () => {
		route([['external_ids', []], ['themoviedb.org', { id: 'x', title: 5, runtime: '148', production_companies: 'x', videos: null, credits: [], imdb_id: 'tt9' }]]);
		expect(await tmdb().getTmdbMovieDetails('1')).toEqual({
			imdbId: '0', title: '', mediaType: 'movie', episodes: 1, episodeDuration: 120, releaseDate: '', url: 'https://www.imdb.com/title/tt9',
			seasons: [{ name: 'Movie', episodes: 1, offset: 0 }], trailerUrl: undefined, studio: [], director: [], cast: [],
		});
	});

	it('maps real series details without the specials season', async () => {
		route([['external_ids', { imdb_id: 'tt0903747' }], ['themoviedb.org', tmdbTv]]);
		expect(await tmdb().getTmdbTvDetails('1396')).toEqual({
			imdbId: '1396', title: 'Breaking Bad', mediaType: 'tv', episodes: 20, episodeDuration: 45, releaseDate: '2008-01-20',
			url: 'https://www.imdb.com/title/tt0903747',
			seasons: [{ name: 'Season 1', episodes: 7, offset: 0 }, { name: 'Season 2', episodes: 13, offset: 7 }],
			trailerUrl: 'https://www.youtube.com/watch?v=HhesaQXLuRY', studio: ['AMC', 'Sony Pictures Television Studios'],
			director: ['Vince Gilligan'], cast: ['Bryan Cranston', 'Aaron Paul'],
		});
	});

	it('builds series details with empty values from wrong-typed fields', async () => {
		route([['external_ids', null], ['themoviedb.org', {
			id: 5, name: 5, seasons: [null, { season_number: 0 }, { season_number: 3, name: 5, episode_count: '7' }, { name: 'Extras', episode_count: 4 }],
			number_of_episodes: 'many', episode_run_time: 'x', networks: 'x', created_by: 'x', credits: 'x',
		}]]);
		expect(await tmdb().getTmdbTvDetails('5')).toMatchObject({
			imdbId: '5', title: '', episodes: 4, episodeDuration: 45, url: '', trailerUrl: undefined, studio: [], director: [], cast: [],
			seasons: [{ name: 'Season 3', episodes: 0, offset: 0 }, { name: 'Extras', episodes: 4, offset: 0 }],
		});
		route([['external_ids', {}], ['themoviedb.org', { id: 5, number_of_episodes: 8 }]]);
		expect(await tmdb().getTmdbTvDetails('5')).toMatchObject({ episodes: 8, seasons: [] });
	});

	it('rethrows a rejected token and is null on other failures', async () => {
		sent.mockResolvedValue(reply(401));
		await expect(tmdb().getTmdbMovieDetails('1')).rejects.toMatchObject({ reason: 'auth' });
		await expect(tmdb().getTmdbTvDetails('1')).rejects.toMatchObject({ reason: 'auth' });
		sent.mockRejectedValue(new Error('offline'));
		expect(await tmdb().getTmdbMovieDetails('1')).toBeNull();
		expect(await tmdb().getTmdbTvDetails('1')).toBeNull();
	});

	it('reads airing from the series detail', async () => {
		respond(tmdbTv);
		expect(await tmdb().fetchAiring({ tmdbId: 1396, tmdbMediaType: 'tv' })).toMatchObject({
			status: 'found',
			value: { nextEpisode: 4, nextSeason: 3, nextAirDate: '2030-05-01', lastEpisode: 13, lastSeason: 2 },
		});
	});

	it('reads an empty airing pointer from wrong-typed fields', async () => {
		respond({ next_episode_to_air: 'x', last_episode_to_air: { episode_number: '1', season_number: 2 } });
		const r = await tmdb().fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' });
		expect(r.status === 'found' && Object.keys(r.value)).toEqual(['refreshedAt']);
		respond({ next_episode_to_air: { episode_number: 2, season_number: '1', air_date: 5 }, last_episode_to_air: { episode_number: 1 } });
		const partial = await tmdb().fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' });
		expect(partial).toMatchObject({ value: { nextEpisode: 2, lastEpisode: 1 } });
		expect(partial.status === 'found' && partial.value).not.toHaveProperty('nextSeason');
	});

	it('asks nothing for a movie, no id, or no key', async () => {
		expect(await tmdb().fetchAiring({ tmdbId: 1, tmdbMediaType: 'movie' })).toEqual({ status: 'notfound' });
		expect(await new ApiService('').fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' })).toEqual({ status: 'nokey' });
		expect(sent).not.toHaveBeenCalled();
	});

	it('takes the top search hit as the movie id', async () => {
		respond({ results: [{ id: 9 }, { id: 10 }] });
		expect(await tmdb().searchTmdbMovieId('Dune', '2021-10-22')).toBe(9);
		expect((sent.mock.calls[0]![0] as { url: string }).url).toContain('primary_release_year=2021');
		respond({ results: [{ id: 'x' }] });
		expect(await tmdb().searchTmdbMovieId('Dune')).toBeNull();
		respond({ results: 'x' });
		expect(await tmdb().searchTmdbMovieId('Dune')).toBeNull();
		expect(await tmdb().searchTmdbMovieId('  ')).toBeNull();
		sent.mockRejectedValue(new Error('offline'));
		expect(await tmdb().searchTmdbMovieId('Dune')).toBeNull();
	});

	it('maps a collection and reads wrong-typed parts as empty', async () => {
		respond({ id: 99, name: 'Dune Collection', overview: 'o', poster_path: '/p.jpg', parts: [{ id: 1, title: 'Dune', release_date: '2021-10-22', poster_path: '/d.jpg', overview: 'x' }] });
		expect(await tmdb().getTmdbCollection(99)).toEqual({
			id: 99, name: 'Dune Collection', overview: 'o', poster_path: '/p.jpg',
			parts: [{ id: 1, title: 'Dune', release_date: '2021-10-22', poster_path: '/d.jpg', overview: 'x' }],
		});
		respond({ id: 99, name: 5, overview: null, poster_path: 5, parts: [null, { id: 'x' }, { id: 2, title: 5, poster_path: null }] });
		expect(await tmdb().getTmdbCollection(99)).toEqual({
			id: 99, name: '', overview: '', poster_path: null,
			parts: [{ id: 2, title: '', release_date: '', poster_path: null, overview: '' }],
		});
		respond({ id: 'x' });
		expect(await tmdb().getTmdbCollection(99)).toBeNull();
		respond({ id: 0 });
		expect(await tmdb().getTmdbCollection(99)).toBeNull();
		sent.mockRejectedValue(new Error('offline'));
		expect(await tmdb().getTmdbCollection(99)).toBeNull();
	});

	it('checks the connection', async () => {
		respond(tmdbMovie);
		expect(await tmdb().checkTmdbConnection()).toBe(true);
		respond({ status_message: 'x' });
		expect(await tmdb().checkTmdbConnection()).toBe(false);
	});
});

describe('fetchSeasons', () => {
	it('is one season from the AniList episode count', async () => {
		respond(anilistMedia);
		expect(await anime().fetchSeasons(ids({ anilistId: 1 }))).toEqual({ status: 'found', value: [{ name: 'Season 1', episodes: 26, offset: 0 }] });
		respond({ data: { Media: { episodes: 'many' } } });
		expect(await anime().fetchSeasons(ids({ anilistId: 1 }))).toEqual({ status: 'notfound' });
	});

	it('is one season from the Jikan episode count', async () => {
		respond(jikanAnime);
		expect(await anime().fetchSeasons(ids({ malId: 1 }))).toEqual({ status: 'found', value: [{ name: 'Season 1', episodes: 26, offset: 0 }] });
		respond({ data: { episodes: null } });
		expect(await anime().fetchSeasons(ids({ malId: 1 }))).toEqual({ status: 'notfound' });
	});

	it('is the TMDB series seasons', async () => {
		route([['external_ids', {}], ['themoviedb.org', tmdbTv]]);
		const r = await tmdb().fetchSeasons(ids({ tmdbId: 1396, tmdbMediaType: 'tv' }));
		expect(r).toMatchObject({ status: 'found' });
		expect(r.status === 'found' && r.value).toHaveLength(2);
		expect(await tmdb().fetchSeasons(ids({ tmdbId: 1, tmdbMediaType: 'movie' }))).toEqual({ status: 'notfound' });
		expect(await new ApiService('').fetchSeasons(ids({ tmdbId: 1, tmdbMediaType: 'tv' }))).toEqual({ status: 'nokey' });
		route([['external_ids', {}], ['themoviedb.org', { id: 1, seasons: [] }]]);
		expect(await tmdb().fetchSeasons(ids({ tmdbId: 1, tmdbMediaType: 'tv' }))).toEqual({ status: 'notfound' });
	});

	it('goes through the IMDb id when there is no other id', async () => {
		const withLink = { externalLink: 'https://www.imdb.com/title/tt0903747/' };
		route([['Season=', omdbSeason], ['omdbapi.com', omdbSeries]]);
		expect(await omdb().fetchSeasons(withLink)).toMatchObject({ status: 'found' });
		route([['/find/', { movie_results: [{ id: 27205 }], tv_results: [] }], ['external_ids', {}], ['themoviedb.org', tmdbMovie]]);
		expect(await tmdb().fetchSeasons(withLink)).toEqual({ status: 'notfound' });
		route([['/find/', { tv_results: [{ id: 1396 }], movie_results: [] }], ['external_ids', {}], ['themoviedb.org', tmdbTv]]);
		expect(await tmdb().fetchSeasons(withLink)).toMatchObject({ status: 'found' });
		sent.mockRejectedValue(new Error('offline'));
		expect(await omdb().fetchSeasons(withLink)).toEqual({ status: 'failed' });
		expect(await new ApiService('').fetchSeasons(withLink)).toEqual({ status: 'nokey' });
		expect(await omdb().fetchSeasons(ids({ externalLink: 'https://example.com' }))).toEqual({ status: 'notfound' });
	});

	it('is failed on a request failure and nokey on a rejected key', async () => {
		sent.mockRejectedValue(new Error('offline'));
		expect(await anime().fetchSeasons(ids({ malId: 1 }))).toEqual({ status: 'failed' });
		sent.mockResolvedValue(reply(401));
		expect(await tmdb().fetchSeasons(ids({ tmdbId: 1, tmdbMediaType: 'tv' }))).toEqual({ status: 'nokey' });
	});
});

describe('community rating', () => {
	const mal = (over: Partial<HoardTitle> = {}) => title({ type: 'Anime', malId: 1, ...over });

	it('reads the MAL score and member count', async () => {
		respond(jikanAnime);
		expect(await anime().fetchCommunityRating(mal())).toEqual({ rating: 8.75, votes: 1000000, source: 'mal' });
	});

	it('reads the AniList score and popularity', async () => {
		respond(anilistMedia);
		expect(await anime().fetchCommunityRating(mal({ anilistId: 1 }), 'anilist')).toEqual({ rating: 86, votes: 270000, source: 'anilist' });
	});

	it('tries the other anime API when the preferred one has nothing', async () => {
		route([['graphql.anilist.co', { data: { Media: null } }], ['/anime/1', jikanAnime]]);
		expect(await anime().fetchCommunityRating(mal({ anilistId: 2 }), 'anilist')).toMatchObject({ source: 'mal' });
		route([['/anime/1', { data: { score: null, scored_by: null } }], ['graphql.anilist.co', anilistMedia]]);
		expect(await anime().fetchCommunityRating(mal({ anilistId: 2 }), 'jikan')).toMatchObject({ source: 'anilist' });
	});

	it('skips an anime API whose id is missing or not positive', async () => {
		respond(jikanAnime);
		expect(await anime().fetchCommunityRating(mal({ malId: 0 }))).toBeNull();
		expect(await anime().fetchCommunityRating(title({ type: 'Anime' }))).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});

	it('reads the IMDb rating from OMDb for a movie or show with an IMDb link', async () => {
		const movie = title({ externalLink: 'https://www.imdb.com/title/tt1375666/' });
		respond(omdbMovie);
		expect(await omdb().fetchCommunityRating(movie)).toEqual({ rating: 8.8, votes: 2700000, source: 'imdb' });
		expect(await omdb().fetchCommunityRating({ ...movie, type: 'TV Show' })).toMatchObject({ source: 'imdb' });
		expect(await omdb().fetchCommunityRating({ ...movie, type: 'Documentary' })).toBeNull();
		expect(await omdb().fetchCommunityRating({ ...movie, type: 'Documentary' }, 'jikan', 'movie')).toMatchObject({ source: 'imdb' });
	});

	it('falls back to TMDB when OMDb has no rating or no key', async () => {
		const movie = title({ externalLink: 'https://www.imdb.com/title/tt1375666/' });
		route([['omdbapi.com', { Response: 'True', imdbRating: 'N/A', imdbVotes: 'N/A' }], ['/find/', tmdbFind]]);
		expect(await new ApiService('okey', 'tkey').fetchCommunityRating(movie)).toEqual({ rating: 8.369, votes: 36100, source: 'tmdb' });
		route([['omdbapi.com', { Response: 'False' }], ['/find/', { movie_results: [], tv_results: [{ vote_average: 9, vote_count: 3 }] }]]);
		expect(await new ApiService('okey', 'tkey').fetchCommunityRating(movie)).toEqual({ rating: 9, votes: 3, source: 'tmdb' });
		route([['/find/', tmdbFind]]);
		expect(await tmdb().fetchCommunityRating(movie)).toMatchObject({ source: 'tmdb' });
	});

	it('is null when every source is empty, broken or wrong-typed', async () => {
		const movie = title({ externalLink: 'https://www.imdb.com/title/tt1375666/' });
		const both = new ApiService('okey', 'tkey');
		route([['omdbapi.com', { Response: 'True', imdbRating: 8, imdbVotes: null }], ['/find/', { movie_results: ['x'], tv_results: null }]]);
		expect(await both.fetchCommunityRating(movie)).toBeNull();
		route([['omdbapi.com', 'x'], ['/find/', []]]);
		expect(await both.fetchCommunityRating(movie)).toBeNull();
		sent.mockRejectedValue(new Error('offline'));
		expect(await both.fetchCommunityRating(movie)).toBeNull();
		expect(await both.fetchCommunityRating(title({ externalLink: 'no id here' }))).toBeNull();
		expect(await both.fetchCommunityRating(title({ type: 'Game' }))).toBeNull();
	});

	it('is null for wrong-typed anime scores', async () => {
		respond({ data: { score: '8.7', scored_by: 'many' }, averageScore: 'x' });
		expect(await anime().fetchCommunityRating(mal())).toBeNull();
		respond({ data: { Media: { averageScore: '86', popularity: null } } });
		expect(await anime().fetchCommunityRating(mal({ malId: undefined, anilistId: 1 }), 'anilist')).toBeNull();
	});
});
