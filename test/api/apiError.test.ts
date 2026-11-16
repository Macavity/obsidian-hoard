import { describe, expect, it } from 'vitest';
import { ApiError, apiLabel, httpError, isKeyless } from '../../src/api/apiError';

const reasonOf = (...args: Parameters<typeof httpError>): string => httpError(...args).reason;

describe('httpError', () => {
	it('builds the whole error from the response', () => {
		const err = httpError('jikan', 503, '{"message":" upstream down "}');
		expect(err).toBeInstanceOf(ApiError);
		expect(err).toBeInstanceOf(Error);
		expect({ ...err, name: err.name, message: err.message }).toEqual({
			name: 'ApiError',
			message: 'MyAnimeList returned 503',
			source: 'jikan',
			reason: 'server',
			status: 503,
			providerMessage: 'upstream down',
		});
	});

	it('leaves the provider text empty when the body explains nothing', () => {
		expect(httpError('tmdb', 500, '').providerMessage).toBe('');
		expect(httpError('tmdb', 500, 'not json').providerMessage).toBe('');
		expect(httpError('tmdb', 500, '{"message":42}').providerMessage).toBe('');
		expect(httpError('tmdb', 500, '{"errors":[{"message":7}]}').providerMessage).toBe('');
		expect(httpError('tmdb', 500, 'null').providerMessage).toBe('');
	});

	it('prefers the first GraphQL error over a top-level message', () => {
		expect(httpError('anilist', 500, '{"errors":[{"message":"first"},{"message":"second"}],"message":"top"}').providerMessage).toBe('first');
		expect(httpError('anilist', 500, '{"errors":[{}],"message":"top"}').providerMessage).toBe('top');
	});

	it.each([
		['a keyless service refusing to serve is an outage', 'anilist', 403, '', 'server'],
		['OMDb packs an exhausted quota into a 401', 'omdb', 401, 'Request limit reached!', 'rate-limited'],
		['Google reports a disabled API as 403', 'googleBooks', 403, 'accessNotConfigured', 'not-enabled'],
		['Google reports an exhausted quota as 403', 'googleBooks', 403, 'dailyLimitExceeded', 'rate-limited'],
		['a refused credential', 'rawg', 401, '', 'auth'],
		['a rate limit', 'tmdb', 429, '', 'rate-limited'],
		['nothing there', 'igdb', 404, '', 'not-found'],
		['an outage', 'twitch', 500, '', 'server'],
		['anything else', 'unknown', 418, '', 'http'],
	] as const)('%s', (_name, source, status, body, reason) => {
		expect(reasonOf(source, status, body)).toBe(reason);
	});

	it('takes the first rule that matches', () => {
		// keyless beats the general 401/403 rule, the body rules beat it too
		expect(reasonOf('cinemeta', 401, 'limit')).toBe('server');
		expect(reasonOf('omdb', 403, 'limit')).toBe('rate-limited');
		expect(reasonOf('omdb', 403, 'nope')).toBe('auth');
		expect(reasonOf('googleBooks', 403, 'accessNotConfigured rateLimitExceeded')).toBe('not-enabled');
		// a body pattern belongs to its service and its status
		expect(reasonOf('tmdb', 401, 'limit accessNotConfigured')).toBe('auth');
		expect(reasonOf('googleBooks', 401, 'accessNotConfigured')).toBe('auth');
		expect(reasonOf('omdb', 500, 'limit')).toBe('server');
		expect(reasonOf('googleBooks', 404, 'rateLimitExceeded')).toBe('not-found');
	});

	it('reads a 401 or 403 as a rejected login once a credential went out to a keyless service', () => {
		expect(reasonOf('jikan', 401, '', true)).toBe('auth');
		expect(reasonOf('jikan', 403, '', true)).toBe('auth');
		expect(reasonOf('jikan', 403, '', false)).toBe('server');
		expect(reasonOf('jikan', 503, '', true)).toBe('server');
		expect(reasonOf('jikan', 429, '', true)).toBe('rate-limited');
		// a keyed service is not affected either way
		expect(reasonOf('tmdb', 401, '', true)).toBe('auth');
		expect(reasonOf('tmdb', 401, '', false)).toBe('auth');
	});

	it('sorts the statuses around the boundaries', () => {
		expect([499, 500, 501, 599, 600].map((s) => reasonOf('tmdb', s, ''))).toEqual(['http', 'server', 'server', 'server', 'server']);
		expect([400, 402, 405, 410, 428, 430].map((s) => reasonOf('tmdb', s, ''))).toEqual(['http', 'http', 'http', 'http', 'http', 'http']);
	});
});

describe('ApiError', () => {
	it('carries no status and no provider text unless given', () => {
		const err = new ApiError('omdb', 'no-key', 'OMDb API key not set');
		expect([err.name, err.message, err.source, err.reason, err.status, err.providerMessage])
			.toEqual(['ApiError', 'OMDb API key not set', 'omdb', 'no-key', undefined, undefined]);
	});
});

describe('service facts', () => {
	it('names every service for developer messages', () => {
		expect((['tmdb', 'omdb', 'jikan', 'anilist', 'googleBooks', 'rawg', 'igdb', 'twitch', 'cinemeta', 'openLibrary', 'steamStore', 'unknown'] as const).map(apiLabel))
			.toEqual(['TMDB', 'OMDb', 'MyAnimeList', 'AniList', 'Google Books', 'RAWG', 'IGDB', 'Twitch', 'Cinemeta', 'Open Library', 'Steam Store', 'The API']);
	});

	it('knows which services take no credential', () => {
		expect((['tmdb', 'omdb', 'jikan', 'anilist', 'googleBooks', 'rawg', 'igdb', 'twitch', 'cinemeta', 'openLibrary', 'steamStore', 'unknown'] as const).filter(isKeyless))
			.toEqual(['jikan', 'anilist', 'cinemeta', 'openLibrary', 'steamStore']);
	});
});
