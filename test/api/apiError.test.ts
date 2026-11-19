import { afterEach, describe, expect, it } from 'vitest';
import {
	ApiError, apiErrorMessage, apiErrorShort, apiLabel, httpError, lookupOfError, rethrowAuth,
} from '../../src/shared/api/apiError';
import { setLocale } from '../../src/shared/i18n';

afterEach(() => setLocale('en'));

const SOURCES = ['tmdb', 'omdb', 'jikan', 'anilist', 'googleBooks', 'rawg', 'igdb', 'twitch', 'cinemeta', 'openLibrary', 'steamStore', 'unknown'] as const;
const REASONS = ['no-key', 'auth', 'not-enabled', 'rate-limited', 'not-found', 'server', 'http', 'parse', 'network'] as const;

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
		expect(SOURCES.map(apiLabel))
			.toEqual(['TMDB', 'OMDb', 'MyAnimeList', 'AniList', 'Google Books', 'RAWG', 'IGDB', 'Twitch', 'Cinemeta', 'Open Library', 'Steam Store', 'The API']);
	});
});

describe('the wording of a reason', () => {
	it('exists for every reason and service, in both languages, with nothing left to fill in', () => {
		for (const lang of ['en', 'de']) {
			setLocale(lang);
			for (const reason of REASONS) {
				for (const source of SOURCES) {
					const err = new ApiError(source, reason, 'dev', { status: 500 });
					// a missing translation comes back as its key, a missing parameter as its placeholder
					expect(apiErrorMessage(err), `${lang} ${reason} ${source}`).not.toMatch(/^notices\.|\{\w+\}/);
					expect(apiErrorShort(err), `${lang} ${reason} ${source}`).not.toMatch(/^notices\.|\{\w+\}/);
				}
			}
		}
	});

	it('gives the services that take no credential the outage sentence without the key remark', () => {
		const keyless = SOURCES.filter((source) =>
			!apiErrorMessage(new ApiError(source, 'server', 'dev', { status: 503 })).includes('This is not your key'));
		expect(keyless).toEqual(['jikan', 'anilist', 'cinemeta', 'openLibrary', 'steamStore']);
	});

	it('names the services that have a sentence of their own', () => {
		const own = (reason: typeof REASONS[number], general: RegExp): string[] =>
			SOURCES.filter((source) => !general.test(apiErrorMessage(new ApiError(source, reason, 'dev'))));
		expect(own('auth', /rejected your credentials\.$/)).toEqual(['tmdb', 'omdb', 'googleBooks', 'rawg', 'igdb', 'twitch']);
		expect(own('rate-limited', /wait a moment and try again\.$/)).toEqual(['omdb', 'jikan', 'anilist', 'googleBooks']);
		expect(own('no-key', /API key required/)).toEqual(['tmdb']);
		for (const reason of ['not-enabled', 'not-found', 'parse', 'network', 'http'] as const) {
			expect(new Set(SOURCES.map((source) => apiErrorMessage(new ApiError(source, reason, 'dev')).replace(apiLabel(source), '@'))).size, reason).toBe(1);
		}
	});

	it('writes a question mark where a status is named and none is known', () => {
		expect(apiErrorMessage(new ApiError('tmdb', 'server', 'dev'))).toBe('TMDB is temporarily unavailable (HTTP ?). This is not your key; try again shortly.');
		expect(apiErrorMessage(new ApiError('jikan', 'server', 'dev'))).toBe('MyAnimeList is temporarily unavailable (HTTP ?). Try again shortly.');
		expect(apiErrorMessage(new ApiError('tmdb', 'http', 'dev'))).toBe('TMDB request failed (HTTP ?).');
		expect(apiErrorShort(new ApiError('tmdb', 'http', 'dev'))).toBe('Failed (HTTP ?)');
		expect(apiErrorShort(new ApiError('tmdb', 'http', 'dev', { status: 418 }))).toBe('Failed (HTTP 418)');
	});

	it('shows the provider text for an outage or an unexplained status only', () => {
		const shown = REASONS.filter((reason) =>
			apiErrorMessage(new ApiError('tmdb', reason, 'dev', { status: 500, providerMessage: 'boom' })) === 'TMDB: boom.');
		expect(shown).toEqual(['server', 'http']);
		for (const reason of REASONS) {
			expect(apiErrorMessage(new ApiError('tmdb', reason, 'dev', { status: 500, providerMessage: 'boom' })).includes('boom'), reason)
				.toBe(reason === 'server' || reason === 'http');
		}
		expect(apiErrorMessage(new ApiError('tmdb', 'server', 'dev', { status: 500, providerMessage: '' })))
			.toBe('TMDB is temporarily unavailable (HTTP 500). This is not your key; try again shortly.');
	});

	it('ends a provider text with a full stop unless it already ends a sentence', () => {
		const said = (text: string): string => apiErrorMessage(new ApiError('unknown', 'http', 'dev', { providerMessage: text }));
		expect([said('down'), said('down.'), said('down!'), said('down?'), said('down;')])
			.toEqual(['The API: down.', 'The API: down.', 'The API: down!', 'The API: down?', 'The API: down;.']);
	});
});

describe('lookupOfError', () => {
	it('sorts every reason into what a lookup does next', () => {
		expect(REASONS.map((reason) => [reason, lookupOfError(new ApiError('tmdb', reason, 'dev')).status])).toEqual([
			['no-key', 'nokey'],
			['auth', 'nokey'],
			['not-enabled', 'nokey'],
			['rate-limited', 'failed'],
			['not-found', 'notfound'],
			['server', 'failed'],
			['http', 'failed'],
			['parse', 'failed'],
			['network', 'failed'],
		]);
	});

	it('treats anything that is no API error as failed', () => {
		expect([new Error('x'), 'x', undefined, null, { reason: 'auth' }].map((value) => lookupOfError(value)))
			.toEqual(Array.from({ length: 5 }, () => ({ status: 'failed' })));
	});
});

describe('rethrowAuth', () => {
	const thrownBy = (value: unknown): unknown => {
		try {
			rethrowAuth(value);
		} catch (err) {
			return err;
		}
		return 'returned';
	};

	it('throws the same error for a rejected credential and returns for everything else', () => {
		const outcome = REASONS.map((reason) => {
			const err = new ApiError('omdb', reason, 'dev');
			const result = thrownBy(err);
			return [reason, result === err ? 'thrown' : result];
		});
		expect(outcome).toEqual([
			['no-key', 'returned'],
			['auth', 'thrown'],
			['not-enabled', 'thrown'],
			['rate-limited', 'returned'],
			['not-found', 'returned'],
			['server', 'returned'],
			['http', 'returned'],
			['parse', 'returned'],
			['network', 'returned'],
		]);
	});

	it('returns for a value that is no API error', () => {
		expect([new Error('x'), undefined, { reason: 'auth' }].map(thrownBy)).toEqual(['returned', 'returned', 'returned']);
	});
});
