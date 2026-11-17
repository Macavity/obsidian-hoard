import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiService, apiErrorMessage, apiErrorShort } from '../src/ApiService';
import { setLocale } from '../src/i18n';
import { ERROR_ROWS } from './apiErrors.fixture';
import { CALLS, answer, failure, sent } from './helpers/apiFailures';

beforeEach(() => { sent.mockReset(); });
afterEach(() => setLocale('en'));

describe('a response outside 2xx', () => {
	it.each(ERROR_ROWS)('$service $status $body is $reason', async (row) => {
		answer(row.service, row.status, row.body);
		const err = await failure(CALLS[row.service]);
		expect(err).toMatchObject({ name: 'ApiError', source: row.source, reason: row.reason, status: row.status });
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([row.message, row.short]);
		setLocale('de');
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([row.messageDe, row.shortDe]);
	});

	it('covers every reason a status can give', () => {
		expect([...new Set(ERROR_ROWS.map((r) => r.reason))].sort())
			.toEqual(['auth', 'http', 'not-enabled', 'not-found', 'rate-limited', 'server']);
	});
});

describe('no credential set', () => {
	const bare = (): ApiService => new ApiService('');

	it.each([
		['TMDB', () => bare().checkTmdbConnection(), 'tmdb', 'TMDB token required; add one in Settings → API.'],
		['OMDb', () => bare().checkOmdbConnection(), 'omdb', 'OMDb API key required; add one in Settings → API.'],
		['Google Books', () => bare().checkGoogleBooksConnection(), 'googleBooks', 'Google Books API key required; add one in Settings → API.'],
		['RAWG', () => bare().checkRawgConnection(), 'rawg', 'RAWG API key required; add one in Settings → API.'],
		['RAWG search', () => bare().searchRawgGames('x'), 'rawg', 'RAWG API key required; add one in Settings → API.'],
		['IGDB', () => bare().checkIgdbConnection(), 'twitch', 'Twitch API key required; add one in Settings → API.'],
		['IGDB search', () => bare().searchIgdbGames('x'), 'twitch', 'Twitch API key required; add one in Settings → API.'],
	] as const)('%s asks for the key and sends nothing', async (_name, call, source, message) => {
		const err = await failure(call);
		expect(err).toMatchObject({ name: 'ApiError', source, reason: 'no-key' });
		expect((err as { status?: number }).status).toBeUndefined();
		expect([apiErrorMessage(err), apiErrorShort(err)]).toEqual([message, 'No key set']);
		expect(sent).not.toHaveBeenCalled();
	});

	it('reads the same in German', async () => {
		setLocale('de');
		const tmdb = await failure(() => bare().checkTmdbConnection());
		const omdb = await failure(() => bare().checkOmdbConnection());
		expect([apiErrorMessage(tmdb), apiErrorMessage(omdb), apiErrorShort(omdb)]).toEqual([
			'TMDB-Token erforderlich; trage unter Einstellungen → API einen ein.',
			'OMDb-API-Schlüssel erforderlich; trage unter Einstellungen → API einen ein.',
			'Kein Schlüssel',
		]);
	});

	it('treats a Google Books key of blanks as no key', async () => {
		const err = await failure(() => new ApiService('', '', '   ').checkGoogleBooksConnection());
		expect(err).toMatchObject({ source: 'googleBooks', reason: 'no-key' });
	});
});

describe('a value that is no API error', () => {
	it.each([['a string', 'x'], ['undefined', undefined], ['a plain Error', new Error('boom')], ['a look-alike', { source: 'tmdb', reason: 'auth' }]])(
		'%s gets the generic texts', (_name, value) => {
			expect([apiErrorMessage(value), apiErrorShort(value)]).toEqual(['Request failed; check your connection.', 'Failed']);
		});
});
