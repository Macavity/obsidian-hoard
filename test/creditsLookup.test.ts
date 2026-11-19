import { requestUrl } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../src/shared/api/ApiService';
import { fakeSettings } from './helpers/fakeSettings';
import { newTitleDetail } from './helpers/newTitleDetail';
import type { HoardTitle } from '../src/modules/watchlist/domain/model';
import { DEFAULT_SETTINGS } from '../src/modules/settings/domain/settingsDefaults';
import { setupDataManager } from './helpers/setupDataManager';

const sent = vi.mocked(requestUrl);
const ok = (json: unknown) => ({ status: 200, text: JSON.stringify(json), json }) as never;
const status = (code: number) => ({ status: code, text: '', json: null }) as never;

/** Answers by URL part: the first matching route wins; an Error rejects, a number is an HTTP status, anything unmatched is offline. */
function route(routes: Array<[string, unknown]>) {
	sent.mockImplementation(((p: { url: string }) => {
		const hit = routes.find(([part]) => p.url.includes(part));
		if (!hit) return Promise.reject(new Error('offline'));
		if (hit[1] instanceof Error) return Promise.reject(hit[1]);
		if (typeof hit[1] === 'number') return Promise.resolve(status(hit[1]));
		return Promise.resolve(ok(hit[1]));
	}) as never);
}

const title = (over: Partial<HoardTitle>): HoardTitle => ({
	id: 't1', title: 'X', type: 'Movie', status: '', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 100,
	releaseDate: null, externalLink: 'https://www.imdb.com/title/tt0078748/', seasons: [], watchedEpisodes: [], ...over,
});

const omdbHit = { Response: 'True', imdbID: 'tt0078748', Type: 'movie', Director: 'Ridley Scott', Actors: 'Sigourney Weaver, Tom Skerritt' };
const cinemetaHit = { meta: { id: 'tt0078748', type: 'movie', name: 'Alien', year: '1979', runtime: '117 min', released: '1979-05-25T00:00:00.000Z', cast: ['Veronica Cartwright'], director: ['Ridley Scott'] } };
const keyed = () => new ApiService('omdb-key', 'tmdb-key');

beforeEach(() => { sent.mockReset(); });

describe('fetchCredits', () => {
	it('is failed when OMDb and TMDB fail and Cinemeta has nothing', async () => {
		route([['omdbapi.com', new Error('offline')], ['themoviedb.org', new Error('offline')], ['cinemeta', {}]]);
		expect(await keyed().fetchCredits(title({}), 'omdb')).toEqual({ status: 'failed' });
	});

	it('is notfound when all three sources answer without the title', async () => {
		route([
			['omdbapi.com', { Response: 'False' }],
			['themoviedb.org', { movie_results: [], tv_results: [] }],
			['cinemeta', {}],
		]);
		expect(await keyed().fetchCredits(title({}), 'omdb')).toEqual({ status: 'notfound' });
	});

	it('is failed when keyless Cinemeta throws and no key is set', async () => {
		route([['cinemeta', new Error('offline')]]);
		expect(await new ApiService('').fetchCredits(title({}), 'cinemeta')).toEqual({ status: 'failed' });
	});

	it('is notfound for a title without an IMDb id, and sends nothing', async () => {
		route([]);
		expect(await keyed().fetchCredits(title({ externalLink: '' }), 'omdb')).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
	});

	it('falls through failed sources to the next that has the title', async () => {
		route([['omdbapi.com', new Error('offline')], ['themoviedb.org', 503], ['cinemeta', cinemetaHit]]);
		expect(await keyed().fetchCredits(title({}), 'omdb')).toEqual({
			status: 'found', value: { director: ['Ridley Scott'], cast: ['Veronica Cartwright'] },
		});
	});

	it('treats an OMDb answer with neither director nor cast as notfound', async () => {
		route([['omdbapi.com', { Response: 'True', imdbID: 'tt0078748', Director: 'N/A', Actors: 'N/A' }], ['cinemeta', {}]]);
		expect(await new ApiService('omdb-key').fetchCredits(title({}), 'omdb')).toEqual({ status: 'notfound' });
	});

	it('drops a TMDB cast entry without a name and keeps the rest', async () => {
		route([
			['/find/', { movie_results: [{ id: 348 }] }],
			['/movie/348/credits', {
				crew: [{ job: 'Director', name: 'Ridley Scott' }, { job: 'Director' }, { job: 'Editor', name: 'Terry Rawlings' }],
				cast: [{ name: 'Sigourney Weaver' }, { character: 'Ripley' }, { name: 7 }, null],
			}],
		]);
		expect(await new ApiService('', 'tmdb-key').fetchCredits(title({}), 'tmdb')).toEqual({
			status: 'found', value: { director: ['Ridley Scott'], cast: ['Sigourney Weaver'] },
		});
	});

	it('takes a series creators and cast from the TMDB tv detail', async () => {
		route([
			['/find/', { movie_results: [], tv_results: [{ id: 1396 }] }],
			['/tv/1396', { created_by: [{ name: 'Vince Gilligan' }, {}], credits: { cast: [{ name: 'Bryan Cranston' }] } }],
		]);
		expect(await new ApiService('', 'tmdb-key').fetchCredits(title({}), 'tmdb')).toEqual({
			status: 'found', value: { director: ['Vince Gilligan'], cast: ['Bryan Cranston'] },
		});
	});

	describe('classified request errors', () => {
		type Sources = Record<'omdbCredits' | 'tmdbCredits', (id: string) => Promise<unknown>>;

		it('a 404 from every source is notfound, not failed', async () => {
			route([['omdbapi.com', 404], ['themoviedb.org', 404], ['cinemeta', 404]]);
			expect(await keyed().fetchCredits(title({}), 'omdb')).toEqual({ status: 'notfound' });
		});

		it('a rejected key (401) is not a failure: the keyless source decides', async () => {
			route([['omdbapi.com', 401], ['themoviedb.org', 401], ['cinemeta', {}]]);
			expect(await keyed().fetchCredits(title({}), 'omdb')).toEqual({ status: 'notfound' });
		});

		it('each keyed source reports 404 as notfound and 401 as nokey', async () => {
			const api = keyed() as unknown as Sources;
			route([['omdbapi.com', 404], ['themoviedb.org', 404]]);
			expect(await api.omdbCredits('tt1')).toEqual({ status: 'notfound' });
			expect(await api.tmdbCredits('tt1')).toEqual({ status: 'notfound' });
			route([['omdbapi.com', 401], ['themoviedb.org', 401]]);
			expect(await api.omdbCredits('tt1')).toEqual({ status: 'nokey' });
			expect(await api.tmdbCredits('tt1')).toEqual({ status: 'nokey' });
		});

		it('the keyed sources are nokey without their key, and send nothing', async () => {
			const api = new ApiService('') as unknown as Sources;
			expect(await api.omdbCredits('tt1')).toEqual({ status: 'nokey' });
			expect(await api.tmdbCredits('tt1')).toEqual({ status: 'nokey' });
			expect(sent).not.toHaveBeenCalled();
		});
	});
});

describe('fetchStudio: anime', () => {
	const anime = (over: Partial<HoardTitle> = {}) => title({ type: 'Anime', externalLink: '', ...over });
	const jikanStudios = (studios: unknown) => ({ data: { mal_id: 5, studios } });
	const aniList = (edges: unknown) => ({ data: { Media: { id: 7, studios: { edges } } } });

	it('reads the Jikan studio names', async () => {
		route([['/anime/5', jikanStudios([{ name: 'Bones' }, { name: ' Madhouse ' }])]]);
		expect(await new ApiService('').fetchStudio(anime({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'found', value: { studio: ['Bones', 'Madhouse'] } });
	});

	it('treats Jikan `studios: null` as notfound without throwing', async () => {
		route([['/anime/5', jikanStudios(null)]]);
		expect(await new ApiService('').fetchStudio(anime({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
	});

	it('treats an empty Jikan studio list as notfound', async () => {
		route([['/anime/5', jikanStudios([])]]);
		expect(await new ApiService('').fetchStudio(anime({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
	});

	it('keeps only the main AniList studios', async () => {
		route([['graphql.anilist.co', aniList([{ isMain: true, node: { name: 'bones' } }, { isMain: false, node: { name: 'Helper' } }, { isMain: true }])]]);
		expect(await new ApiService('').fetchStudio(anime({ anilistId: 7 }), 'anilist', 'anime')).toEqual({ status: 'found', value: { studio: ['bones'] } });
	});

	it('is failed when the only source is unreachable', async () => {
		route([['/anime/5', new Error('offline')]]);
		expect(await new ApiService('').fetchStudio(anime({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'failed' });
	});

	it('falls back to the other API when the preferred one has no studio', async () => {
		route([['graphql.anilist.co', aniList([])], ['/anime/5', jikanStudios([{ name: 'Bones' }])]]);
		const both = anime({ malId: 5, anilistId: 7 });
		expect(await new ApiService('').fetchStudio(both, 'anilist', 'anime')).toEqual({ status: 'found', value: { studio: ['Bones'] } });
	});

	it('a 404 for a stale MAL id is notfound', async () => {
		route([['/anime/5', 404]]);
		expect(await new ApiService('').fetchStudio(anime({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
	});

	it('is notfound for a title with no anime id, and sends nothing', async () => {
		route([]);
		expect(await new ApiService('').fetchStudio(anime(), 'jikan', 'anime')).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
	});
});

describe('fetchStudio: movies and shows', () => {
	it('is nokey without a TMDB key, and sends nothing', async () => {
		route([]);
		expect(await new ApiService('omdb-key').fetchStudio(title({}), 'jikan', 'movie')).toEqual({ status: 'nokey' });
		expect(sent).not.toHaveBeenCalled();
	});

	it('resolves the studio and the TMDB id through the IMDb id', async () => {
		route([
			['/find/', { movie_results: [{ id: 348 }] }],
			['/movie/348', { production_companies: [{ name: '20th Century Fox' }, { name: 'Brandywine' }, {}] }],
		]);
		expect(await new ApiService('', 'k').fetchStudio(title({}), 'jikan', 'movie')).toEqual({
			status: 'found', value: { studio: ['20th Century Fox', 'Brandywine'], tmdbId: 348, tmdbMediaType: 'movie' },
		});
	});

	it('puts the networks of a show before its production companies', async () => {
		route([
			['/find/', { movie_results: [], tv_results: [{ id: 1396 }] }],
			['/tv/1396', { networks: [{ name: 'AMC' }], production_companies: [{ name: 'Sony' }] }],
		]);
		expect(await new ApiService('', 'k').fetchStudio(title({ type: 'TV Show' }), 'jikan', 'movie')).toEqual({
			status: 'found', value: { studio: ['AMC', 'Sony'], tmdbId: 1396, tmdbMediaType: 'tv' },
		});
	});

	it('skips /find when the TMDB id is cached', async () => {
		route([['/tv/1396', { networks: [{ name: 'AMC' }] }]]);
		const cached = title({ tmdbId: 1396, tmdbMediaType: 'tv', externalLink: '' });
		expect(await new ApiService('', 'k').fetchStudio(cached, 'jikan', 'movie')).toEqual({ status: 'found', value: { studio: ['AMC'] } });
		expect(sent).toHaveBeenCalledTimes(1);
	});

	it('is notfound when TMDB knows the title but lists no company', async () => {
		route([['/find/', { movie_results: [{ id: 348 }] }], ['/movie/348', { production_companies: null }]]);
		expect(await new ApiService('', 'k').fetchStudio(title({}), 'jikan', 'movie')).toEqual({ status: 'notfound' });
	});

	it('is failed when TMDB is unreachable, notfound on 404 and nokey on 401', async () => {
		const api = new ApiService('', 'k');
		route([['/find/', new Error('offline')]]);
		expect(await api.fetchStudio(title({}), 'jikan', 'movie')).toEqual({ status: 'failed' });
		route([['/find/', 404]]);
		expect(await api.fetchStudio(title({}), 'jikan', 'movie')).toEqual({ status: 'notfound' });
		route([['/find/', 401]]);
		expect(await api.fetchStudio(title({}), 'jikan', 'movie')).toEqual({ status: 'nokey' });
	});

	it('is notfound for an unlinked movie (no IMDb id)', async () => {
		route([]);
		expect(await new ApiService('', 'k').fetchStudio(title({ externalLink: '' }), 'jikan', 'movie')).toEqual({ status: 'notfound' });
	});

	it('is notfound outside the anime and movie groups', async () => {
		expect(await new ApiService('', 'k').fetchStudio(title({}), 'jikan', '')).toEqual({ status: 'notfound' });
	});
});

describe('detail modal backfills', () => {
	const NOTE = '---\nName: Alien\nType: Movie\nURL: https://www.imdb.com/title/tt0078748/\nCover: https://p/x.jpg\n---\n';
	const open = async (api: ApiService) => {
		const { dm, local } = await setupDataManager({ 'W/Movie/Alien.md': NOTE });
		const modal = newTitleDetail({ settings: fakeSettings({ ...DEFAULT_SETTINGS }), titles: dm, api }, { title: dm.getTitle('Movie/Alien')! }) as unknown as {
			maybeBackfillCredits: () => void;
			maybeBackfillStudio: () => void;
		};
		const flush = () => new Promise<void>((r) => setTimeout(r, 0));
		const reopen = async () => { modal.maybeBackfillCredits(); modal.maybeBackfillStudio(); await flush(); };
		return { dm, reopen, check: (kind: 'credits' | 'studio') => local.getCache('Movie/Alien')?.apiCheck?.[kind]?.result };
	};

	beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
	afterEach(() => { vi.useRealTimers(); });

	it('offline: records transient, stores nothing and sends no request on a reopen within the hour', async () => {
		route([]);
		const { dm, reopen, check } = await open(keyed());
		await reopen();
		expect(check('credits')).toBe('transient');
		expect(check('studio')).toBe('transient');
		expect(dm.getTitle('Movie/Alien')!.director ?? []).toEqual([]);
		expect(dm.getTitle('Movie/Alien')!.studio ?? []).toEqual([]);
		const requests = sent.mock.calls.length;
		expect(requests).toBeGreaterThan(0);
		vi.setSystemTime(Date.now() + 5 * 60_000);
		await reopen();
		expect(sent.mock.calls.length).toBe(requests);
		vi.setSystemTime(Date.now() + 61 * 60_000);
		await reopen();
		expect(sent.mock.calls.length).toBeGreaterThan(requests);
	});

	it('records notfound for a clean miss and nokey for a movie studio without a TMDB key', async () => {
		route([['omdbapi.com', { Response: 'False' }], ['cinemeta', {}]]);
		const { reopen, check } = await open(new ApiService('omdb-key'));
		await reopen();
		expect(check('credits')).toBe('notfound');
		expect(check('studio')).toBe('nokey');
	});

	it('stores found credits and a found studio and does not ask again', async () => {
		route([
			['omdbapi.com', omdbHit],
			['/find/', { movie_results: [{ id: 348 }] }],
			['/movie/348', { production_companies: [{ name: 'Brandywine' }] }],
		]);
		const { dm, reopen, check } = await open(keyed());
		await reopen();
		const stored = dm.getTitle('Movie/Alien')!;
		expect(stored.director).toEqual(['Ridley Scott']);
		expect(stored.cast).toEqual(['Sigourney Weaver', 'Tom Skerritt']);
		expect(stored.studio).toEqual(['Brandywine']);
		expect(check('credits')).toBeUndefined();
		const requests = sent.mock.calls.length;
		await reopen();
		expect(sent.mock.calls.length).toBe(requests);
	});
});
