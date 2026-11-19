import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService, apiErrorMessage, apiErrorShort, requestVia } from '../src/shared/api/ApiService';
import { TENRAI_BASE } from '../src/shared/api/jikanBase';
import {
	CALLS, afterToken, answer, answerAll, answerWith, failure, isTokenRequest, reply, respondWith, sent, urlOfCall, type Reply, type Service,
} from './helpers/apiFailures';

beforeEach(() => { sent.mockReset(); });

const NEVER = new Promise<never>(() => {});
const igdbApi = (): ApiService => new ApiService('', '', '', '', 'iid', 'isecret');
const tokenRequests = (): number => sent.mock.calls.filter((c) => isTokenRequest(c[0])).length;

/** Services whose request runs through each of the request paths in ApiService. */
const PATHS: Array<[Service, string, string]> = [
	['tmdb', 'tmdb', 'TMDB'],
	['jikan', 'jikan', 'MyAnimeList'],
	['anilist', 'anilist', 'AniList'],
	['googleBooks', 'googleBooks', 'Google Books'],
	['twitch', 'twitch', 'Twitch'],
	['igdb', 'igdb', 'IGDB'],
	['cinemeta', 'cinemeta', 'Cinemeta'],
	['unknown', 'unknown', 'The API'],
];

describe('a request that never answers', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it.each(PATHS)('%s gives up after 8 seconds', async (service, source, label) => {
		answerWith(service, () => NEVER);
		let err: unknown = 'pending';
		void failure(CALLS[service]).then((e) => { err = e; });
		await vi.advanceTimersByTimeAsync(7999);
		expect(err).toBe('pending');
		await vi.advanceTimersByTimeAsync(1);
		expect(err).toMatchObject({ name: 'ApiError', source, reason: 'network', message: 'Request timed out' });
		expect((err as { status?: number }).status).toBeUndefined();
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([`${label} is unreachable; check your connection.`, 'Unreachable']);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each(PATHS)('%s leaves no timer behind once the request answered', async (service) => {
		answer(service, 500);
		await failure(CALLS[service]);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('leaves no timer behind after a success', async () => {
		answerAll(200, '{"id":550}');
		expect(await CALLS.tmdb()).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('a request that fails before any answer', () => {
	it.each(PATHS)('%s: a thrown error is a network error with its message', async (service, source, label) => {
		answerWith(service, () => { throw new Error('net down'); });
		const err = await failure(CALLS[service]);
		expect(err).toMatchObject({ name: 'ApiError', source, reason: 'network', message: 'net down' });
		expect((err as { status?: number }).status).toBeUndefined();
		expect(apiErrorMessage(err)).toBe(`${label} is unreachable; check your connection.`);
	});

	it.each(PATHS)('%s: a rejected request is a network error with its message', async (service, source) => {
		answerWith(service, () => Promise.reject(new Error('socket hang up')));
		expect(await failure(CALLS[service])).toMatchObject({ source, reason: 'network', message: 'socket hang up' });
	});

	it.each(PATHS)('%s: a rejection that is no Error is still a network error', async (service, source) => {
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test
		answerWith(service, () => Promise.reject('boom'));
		expect(await failure(CALLS[service])).toMatchObject({ source, reason: 'network', message: 'Network error' });
	});
});

describe('a 2xx answer whose body is not JSON', () => {
	const unreadable = (): Promise<Reply> => Promise.resolve({
		status: 200,
		text: '<html>',
		get json(): unknown { throw new SyntaxError('Unexpected token <'); },
	});

	it.each(PATHS)('%s reports an unreadable response', async (service, source, label) => {
		answerWith(service, unreadable);
		const err = await failure(CALLS[service]);
		const dev = `${source === 'unknown' ? 'The API' : label} returned a non-JSON body`;
		expect(err).toMatchObject({ name: 'ApiError', source, reason: 'parse', message: dev });
		expect((err as { status?: number }).status).toBeUndefined();
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([`${label} returned an unreadable response.`, 'Unreadable response']);
	});
});

describe('answers at the edges of 2xx', () => {
	it.each([[199], [300], [304]])('%i is a failed request', async (status) => {
		answerAll(status, '{"id":550}');
		const err = await failure(CALLS.tmdb);
		expect(err).toMatchObject({ source: 'tmdb', reason: 'http', status, message: `TMDB returned ${status}` });
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([`TMDB request failed (HTTP ${status}).`, `Failed (HTTP ${status})`]);
	});

	it.each([[200], [204], [299]])('%i is a success', async (status) => {
		answerAll(status, '{"id":550}');
		expect(await CALLS.tmdb()).toBe(true);
	});

	it('trims the explanation a service sends at the top level of its body', async () => {
		answerAll(500, '{"message":"  padded  "}');
		expect(apiErrorMessage(await failure(CALLS.jikan))).toBe('MyAnimeList: padded.');
	});
});

describe('a login sent along', () => {
	const withLogin = (url: string): Promise<unknown> =>
		requestVia({ base: TENRAI_BASE, headers: {} }, { url, headers: { Authorization: 'Basic eDp5' } });

	it('turns a 401 into a rejected credential for the Jikan endpoint only', async () => {
		answerAll(401);
		expect(await failure(() => withLogin(`${TENRAI_BASE}/anime/1`))).toMatchObject({ source: 'jikan', reason: 'auth', status: 401 });
		expect(await failure(() => withLogin('https://graphql.anilist.co'))).toMatchObject({ source: 'anilist', reason: 'server', status: 401 });
		expect(await failure(() => withLogin('https://v3-cinemeta.strem.io/meta/movie/tt1.json'))).toMatchObject({ source: 'cinemeta', reason: 'server', status: 401 });
		expect(await failure(() => withLogin('https://api.themoviedb.org/3/movie/550'))).toMatchObject({ source: 'tmdb', reason: 'auth', status: 401 });
	});

	it('keeps the endpoint login when the request brings headers of its own', async () => {
		answerAll(403, '{"message":"Forbidden"}');
		const err = await failure(() => requestVia(
			{ base: 'https://nas.example.org/v4', headers: { Authorization: 'Basic YTpi' } },
			{ url: 'https://nas.example.org/v4/anime/1', headers: { Accept: 'application/json' } },
		));
		expect(err).toMatchObject({ source: 'jikan', reason: 'auth', status: 403, message: 'MyAnimeList returned 403', providerMessage: 'Forbidden' });
		expect(sent.mock.calls[0]![0]).toMatchObject({ headers: { Authorization: 'Basic YTpi', Accept: 'application/json' }, throw: false });
	});
});

describe('OMDb errors inside a 200', () => {
	const omdbSays = (error?: string): void => answerAll(200, JSON.stringify({ Response: 'False', Error: error }));

	it.each([
		['Invalid API key!', 'auth', 'OMDb rejected the key. If it is new, click the activation link OMDb emailed you; keys do not work until activated.'],
		['No API key provided.', 'auth', 'OMDb rejected the key. If it is new, click the activation link OMDb emailed you; keys do not work until activated.'],
		['Request limit reached!', 'rate-limited', 'OMDb daily request limit reached (1,000 per day on the free tier). It resets at midnight UTC.'],
		['Key limit reached', 'rate-limited', 'OMDb daily request limit reached (1,000 per day on the free tier). It resets at midnight UTC.'],
	])('"%s" is %s', async (error, reason, message) => {
		omdbSays(error);
		const err = await failure(CALLS.omdb);
		expect(err).toMatchObject({ name: 'ApiError', source: 'omdb', reason, message: error });
		expect((err as { status?: number }).status).toBeUndefined();
		expect(apiErrorMessage(err)).toBe(message);
	});

	it.each([['Movie not found!'], ['Incorrect IMDb ID.'], [undefined]])('"%s" is an ordinary empty result', async (error) => {
		omdbSays(error);
		expect(await CALLS.omdb()).toBe(false);
	});
});

describe('GraphQL errors inside a 200', () => {
	const gql = (errors: unknown): void => answerAll(200, JSON.stringify({ errors, data: { Page: { media: [] } } }));

	it.each([
		['Too Many Requests.', 'rate-limited', 'AniList is rate-limiting requests; wait a moment and search again.', 'Rate limited'],
		['Rate limit exceeded', 'rate-limited', 'AniList is rate-limiting requests; wait a moment and search again.', 'Rate limited'],
		['Bad query', 'http', 'AniList: Bad query.', 'Failed (HTTP ?)'],
		['Syntax Error: Unexpected Name!', 'http', 'AniList: Syntax Error: Unexpected Name!', 'Failed (HTTP ?)'],
	])('"%s" is %s', async (message, reason, text, short) => {
		gql([{ message }, { message: 'second' }]);
		const err = await failure(CALLS.anilist);
		expect(err).toMatchObject({ name: 'ApiError', source: 'anilist', reason, message });
		expect((err as { status?: number }).status).toBeUndefined();
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([text, short]);
	});

	it('an error without a message is a rejected request', async () => {
		gql([{}]);
		const err = await failure(CALLS.anilist);
		expect(err).toMatchObject({ source: 'anilist', reason: 'http', message: 'Request rejected' });
		expect(apiErrorMessage(err)).toBe('AniList: Request rejected.');
	});

	it.each([['an empty list', []], ['no list', 'x'], ['null', null]])('%s is no error', async (_name, errors) => {
		gql(errors);
		expect(await CALLS.anilist()).toEqual([]);
	});

	it('only GraphQL requests are checked for errors in the body', async () => {
		answerAll(200, JSON.stringify({ errors: [{ message: 'Too Many Requests.' }], data: { mal_id: 1 } }));
		expect(await CALLS.jikan()).toBe(true);
	});
});

describe('the IGDB token', () => {
	const okQuery = (): Promise<Reply> => Promise.resolve(reply(200, '[]'));

	it('is requested with the client credentials and sent with the query', async () => {
		afterToken(okQuery);
		expect(await igdbApi().checkIgdbConnection()).toBe(true);
		expect(sent.mock.calls.map((c) => c[0])).toEqual([
			{
				url: 'https://id.twitch.tv/oauth2/token?client_id=iid&client_secret=isecret&grant_type=client_credentials',
				method: 'POST',
				throw: false,
			},
			{
				url: 'https://api.igdb.com/v4/games',
				method: 'POST',
				headers: { 'Client-ID': 'iid', 'Authorization': 'Bearer tok' },
				body: 'fields id; limit 1;',
				throw: false,
			},
		]);
	});

	it('is requested once for two queries', async () => {
		afterToken(okQuery);
		const api = igdbApi();
		await api.checkIgdbConnection();
		await api.checkIgdbConnection();
		expect(tokenRequests()).toBe(1);
		expect(sent).toHaveBeenCalledTimes(3);
	});

	it.each([
		['rejected', () => Promise.resolve(reply(401))],
		['unavailable', () => Promise.resolve(reply(500))],
		['thrown', () => { throw new Error('net down'); }],
	])('is dropped when a query is %s, so the next call requests a new one', async (_name, bad) => {
		const api = igdbApi();
		afterToken(okQuery);
		await api.checkIgdbConnection();
		afterToken(bad);
		await failure(() => api.checkIgdbConnection());
		expect(tokenRequests()).toBe(1);
		afterToken(okQuery);
		expect(await api.checkIgdbConnection()).toBe(true);
		expect(tokenRequests()).toBe(2);
	});

	it('is not cached when its own request failed', async () => {
		const api = igdbApi();
		answerAll(500);
		expect(await failure(() => api.checkIgdbConnection())).toMatchObject({ source: 'twitch', reason: 'server', status: 500 });
		expect(sent).toHaveBeenCalledTimes(1);
		afterToken(okQuery);
		expect(await api.checkIgdbConnection()).toBe(true);
		expect(tokenRequests()).toBe(2);
	});

	it.each([['30 seconds', { access_token: 'tok', expires_in: 30 }], ['no lifetime', { access_token: 'tok' }]])(
		'with %s is not reused', async (_name, token) => {
			respondWith((params) =>
				Promise.resolve(isTokenRequest(params) ? reply(200, JSON.stringify(token)) : reply(200, '[]')));
			const api = igdbApi();
			await api.checkIgdbConnection();
			await api.checkIgdbConnection();
			expect(tokenRequests()).toBe(2);
		});

	it('missing from a 200 is a rejected credential', async () => {
		answerAll(200, '{}');
		const err = await failure(CALLS.twitch);
		expect(err).toMatchObject({ name: 'ApiError', source: 'twitch', reason: 'auth', message: 'Twitch returned no access token' });
		expect((err as { status?: number }).status).toBeUndefined();
		expect(apiErrorMessage(err)).toBe('Twitch rejected the client ID or secret; re-check both in Settings → API → Games.');
		expect(sent).toHaveBeenCalledTimes(1);
	});

	it('a 200 with a null body is a network error', async () => {
		answerAll(200, 'null');
		const err = await failure(CALLS.twitch);
		expect(err).toMatchObject({ name: 'ApiError', source: 'twitch', reason: 'network' });
		expect(apiErrorMessage(err)).toBe('Twitch is unreachable; check your connection.');
	});
});

describe('background checks', () => {
	const api = (): ApiService => new ApiService('', 'ttoken');
	const CHECKS: Array<[string, () => Promise<{ status: string }>]> = [
		['airing by AniList id', () => api().fetchAiring({ anilistId: 1 })],
		['seasons by AniList id', () => api().fetchSeasons({ anilistId: 1, externalLink: '' })],
		['seasons by MAL id', () => api().fetchSeasons({ malId: 1, externalLink: '' })],
		['airing by TMDB id', () => api().fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' })],
	];

	it.each(CHECKS)('%s: no such title is notfound', async (_name, check) => {
		answerAll(404);
		expect(await check()).toEqual({ status: 'notfound' });
	});

	it.each(CHECKS)('%s: a limit, an outage and a dead connection are failed', async (_name, check) => {
		answerAll(429);
		expect(await check()).toEqual({ status: 'failed' });
		answerAll(500);
		expect(await check()).toEqual({ status: 'failed' });
		answerAll(418);
		expect(await check()).toEqual({ status: 'failed' });
		respondWith(() => { throw new Error('net down'); });
		expect(await check()).toEqual({ status: 'failed' });
	});

	it('a rejected TMDB token is nokey, a 401 from a keyless service is failed', async () => {
		answerAll(401);
		expect(await api().fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' })).toEqual({ status: 'nokey' });
		expect(await api().fetchAiring({ anilistId: 1 })).toEqual({ status: 'failed' });
		expect(await api().fetchSeasons({ malId: 1, externalLink: '' })).toEqual({ status: 'failed' });
		answerAll(403);
		expect(await api().fetchAiring({ tmdbId: 1, tmdbMediaType: 'tv' })).toEqual({ status: 'nokey' });
	});

	it('a GraphQL rate limit inside a 200 is failed', async () => {
		answerAll(200, JSON.stringify({ errors: [{ message: 'Too Many Requests.' }] }));
		expect(await api().fetchAiring({ anilistId: 1 })).toEqual({ status: 'failed' });
	});
});

describe('detail lookups', () => {
	const details = (): Promise<unknown> => new ApiService('okey').getOmdbMovieDetails('tt0111161');

	it('pass a rejected credential on', async () => {
		answerAll(401);
		expect(await failure(details)).toMatchObject({ source: 'omdb', reason: 'auth', status: 401 });
		answerAll(403);
		expect(await failure(details)).toMatchObject({ source: 'omdb', reason: 'auth', status: 403 });
		answerAll(200, '{"Response":"False","Error":"Invalid API key!"}');
		expect(await failure(details)).toMatchObject({ source: 'omdb', reason: 'auth' });
	});

	it.each([
		['an outage', () => answerAll(500)],
		['no such title', () => answerAll(404)],
		['a limit behind a 401', () => answerAll(401, 'Request limit reached!')],
		['a limit inside a 200', () => answerAll(200, '{"Response":"False","Error":"Request limit reached!"}')],
		['a dead connection', () => respondWith(() => { throw new Error('net down'); })],
		['an unreadable body', () => respondWith(() => Promise.resolve({
			status: 200, text: '<html>', get json(): unknown { throw new SyntaxError('x'); },
		}))],
	])('fold %s into null', async (_name, arrange) => {
		arrange();
		expect(await details()).toBeNull();
	});
});

describe('the Steam Web API', () => {
	const steam = (): ApiService => new ApiService('', '', '', '', '', '', 'skey', '76561198000000000');

	it('reports a request that never answers as a network failure', async () => {
		vi.useFakeTimers();
		try {
			respondWith(() => NEVER);
			let owned: unknown = 'pending';
			let achievements: unknown = 'pending';
			void steam().getSteamOwnedGames().then((r) => { owned = r; });
			void steam().getSteamAchievements('1').then((r) => { achievements = r; });
			await vi.advanceTimersByTimeAsync(7999);
			expect([owned, achievements]).toEqual(['pending', 'pending']);
			await vi.advanceTimersByTimeAsync(1);
			expect(owned).toEqual({ ok: false, reason: 'network', games: [] });
			expect(achievements).toBeNull();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves no timer behind once the request answered', async () => {
		vi.useFakeTimers();
		try {
			answerAll(200, '{"response":{"game_count":0}}');
			await steam().getSteamOwnedGames();
			expect(vi.getTimerCount()).toBe(0);
			respondWith(() => { throw new Error('net down'); });
			await steam().getSteamOwnedGames();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('tells a rejected key from an outage and a dead connection', async () => {
		answerAll(401);
		expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason: 'badKey', games: [] });
		answerAll(403);
		expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason: 'badKey', games: [] });
		answerAll(500, '<html>');
		expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason: 'network', games: [] });
		respondWith(() => { throw new Error('net down'); });
		expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason: 'network', games: [] });
		expect(await steam().getSteamAchievements('1')).toBeNull();
	});

	it('sends its requests without the shared error check', async () => {
		answerAll(200, '{"response":{"game_count":0}}');
		expect(await steam().getSteamOwnedGames()).toEqual({ ok: false, reason: 'empty', games: [] });
		expect(urlOfCall(sent.mock.calls[0]![0])).toMatch(/^https:\/\/api\.steampowered\.com\/IPlayerService\/GetOwnedGames\/v1\/\?key=skey&steamid=76561198000000000/);
		expect(sent.mock.calls[0]![0]).toMatchObject({ throw: false });
	});
});
