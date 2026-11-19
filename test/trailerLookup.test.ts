import { requestUrl } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../src/shared/api/ApiService';
import { fakeSettings } from './helpers/fakeSettings';
import { newTitleDetail } from './helpers/newTitleDetail';
import type { HoardTitle } from '../src/modules/watchlist/exports';
import { DEFAULT_SETTINGS } from '../src/modules/settings/exports/settingsDefaults';
import { setupDataManager } from './helpers/setupDataManager';

const sent = vi.mocked(requestUrl);
const urlOf = (i: number) => (sent.mock.calls[i]![0] as { url: string }).url;
const ok = (json: unknown) => ({ status: 200, text: JSON.stringify(json), json }) as never;

/** Answers by URL part: the first matching route wins, anything else is a network error. */
function route(routes: Array<[string, unknown]>) {
	sent.mockImplementation(((p: { url: string }) => {
		const hit = routes.find(([part]) => p.url.includes(part));
		if (!hit) return Promise.reject(new Error('offline'));
		if (hit[1] instanceof Error) return Promise.reject(hit[1]);
		return Promise.resolve(ok(hit[1]));
	}) as never);
}

const title = (over: Partial<HoardTitle>): HoardTitle => ({
	id: 't1', title: 'X', type: 'Anime', status: '', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 24,
	releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [], ...over,
});

const aniList = (trailer: unknown) => ({ data: { Media: { id: 7, trailer } } });
const jikan = (trailer: unknown) => ({ data: { mal_id: 5, trailer } });
const YT = (id: string) => `https://www.youtube.com/watch?v=${id}`;

beforeEach(() => { sent.mockReset(); });

describe('fetchTrailer: anime', () => {
	const both = title({ malId: 5, anilistId: 7 });

	it('reports a Jikan network error as failed, not as a missing trailer', async () => {
		route([['/anime/5', new Error('offline')]]);
		expect(await new ApiService('').fetchTrailer(title({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'failed' });
	});

	it('reports a Jikan answer without a trailer as notfound', async () => {
		route([['/anime/5', jikan(null)]]);
		expect(await new ApiService('').fetchTrailer(title({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
	});

	it('reports a 404 for a stale MAL id as notfound, not failed', async () => {
		sent.mockResolvedValue({ status: 404, text: '', json: null } as never);
		expect(await new ApiService('').fetchTrailer(title({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
	});

	it('finds the Jikan trailer from its embed url', async () => {
		route([['/anime/5', jikan({ youtube_id: null, url: null, embed_url: 'https://www.youtube.com/embed/abcdef12345?enablejsapi=1' })]]);
		expect(await new ApiService('').fetchTrailer(title({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'found', value: YT('abcdef12345') });
	});

	it('treats a wrong-typed AniList trailer as notfound without throwing', async () => {
		route([['graphql.anilist.co', aniList('x')]]);
		expect(await new ApiService('').fetchTrailer(title({ anilistId: 7 }), 'anilist', 'anime')).toEqual({ status: 'notfound' });
	});

	it('falls back to Jikan when the preferred AniList has no trailer', async () => {
		route([['graphql.anilist.co', aniList(null)], ['/anime/5', jikan({ youtube_id: 'jk123456' })]]);
		expect(await new ApiService('').fetchTrailer(both, 'anilist', 'anime')).toEqual({ status: 'found', value: YT('jk123456') });
		expect(urlOf(0)).toContain('anilist');
	});

	it('does not hide a failed source behind a notfound one', async () => {
		route([['graphql.anilist.co', new Error('offline')], ['/anime/5', jikan(null)]]);
		expect(await new ApiService('').fetchTrailer(both, 'anilist', 'anime')).toEqual({ status: 'failed' });
	});

	it('is notfound for a title with no anime id (nothing to look up)', async () => {
		route([]);
		expect(await new ApiService('').fetchTrailer(title({}), 'jikan', 'anime')).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
	});
});

describe('fetchTrailer: movies and shows', () => {
	const movie = title({ type: 'Movie', externalLink: 'https://www.imdb.com/title/tt0078748/' });

	it('reports nokey without a TMDB key and sends nothing', async () => {
		route([]);
		expect(await new ApiService('omdb-key').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'nokey' });
		expect(sent).not.toHaveBeenCalled();
	});

	it('picks the official trailer through the IMDb id', async () => {
		route([
			['/find/tt0078748', { movie_results: [{ id: 348 }], tv_results: [] }],
			['/movie/348/videos', { results: [
				{ site: 'YouTube', key: 'teaser00', type: 'Teaser' },
				{ site: 'YouTube', key: 'plain000', type: 'Trailer' },
				{ site: 'YouTube', key: 'offic000', type: 'Trailer', official: true },
			] }],
		]);
		expect(await new ApiService('', 'tmdb-key').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'found', value: YT('offic000') });
	});

	it('is notfound when TMDB knows the title but lists no usable video', async () => {
		route([['/find/', { movie_results: [{ id: 348 }] }], ['/videos', { results: [{ site: 'Vimeo', key: 'v', type: 'Trailer' }, { site: 'YouTube', type: 'Trailer' }] }]]);
		expect(await new ApiService('', 'k').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'notfound' });
	});

	it('is notfound when TMDB does not know the IMDb id', async () => {
		route([['/find/', { movie_results: [], tv_results: [] }]]);
		expect(await new ApiService('', 'k').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'notfound' });
	});

	it('reports a rejected TMDB key (401) as nokey, not failed', async () => {
		sent.mockResolvedValue({ status: 401, text: '', json: null } as never);
		expect(await new ApiService('', 'k').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'nokey' });
	});

	it('is failed when TMDB is unreachable', async () => {
		route([['/find/', new Error('offline')]]);
		expect(await new ApiService('', 'k').fetchTrailer(movie, 'jikan', 'movie')).toEqual({ status: 'failed' });
	});

	it('is notfound for an unlinked movie (no IMDb id)', async () => {
		route([]);
		expect(await new ApiService('', 'k').fetchTrailer(title({ type: 'Movie' }), 'jikan', 'movie')).toEqual({ status: 'notfound' });
	});
});

describe('search results carry no trailer marker', () => {
	it('leaves trailerUrl absent for an AniList row without a trailer and for OMDb details', async () => {
		route([['graphql.anilist.co', { data: { Page: { media: [{ id: 1, trailer: { id: 'abc', site: 'dailymotion' } }] } } }]]);
		const [row] = await new ApiService('').searchAniList('x');
		expect(row!.trailerUrl).toBeUndefined();

		route([['omdbapi.com', { Response: 'True', imdbID: 'tt1', Title: 'T', Runtime: '100 min', Released: '01 Jan 2000', Director: 'D', Actors: 'A' }]]);
		const detail = await new ApiService('key').getOmdbMovieDetails('tt1');
		expect(detail!.trailerUrl).toBeUndefined();
	});
});

describe('maybeBackfillTrailer', () => {
	const NOTE = '---\nName: Dune\nType: Movie\nExternal ID: tmdb:movie:438631\nCover: https://p/x.jpg\n---\n';
	const open = async (api: ApiService) => {
		const { dm } = await setupDataManager({ 'W/Movie/Dune.md': NOTE });
		const modal = newTitleDetail({ settings: fakeSettings({ ...DEFAULT_SETTINGS }), titles: dm, api }, { title: dm.getTitle('Movie/Dune')! });
		const backfill = () => (modal as unknown as { maybeBackfillTrailer: () => Promise<void> }).maybeBackfillTrailer();
		return { dm, backfill };
	};

	beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
	afterEach(() => { vi.useRealTimers(); });

	it('records transient while offline and sends nothing on a reopen five minutes later', async () => {
		const api = new ApiService('', 'k');
		const fetchTrailer = vi.spyOn(api, 'fetchTrailer').mockResolvedValue({ status: 'failed' });
		const { dm, backfill } = await open(api);
		await backfill();
		expect(fetchTrailer).toHaveBeenCalledTimes(1);
		expect(dm.lookupDue('Movie/Dune', 'trailer')).toBe(false);
		vi.setSystemTime(Date.now() + 5 * 60_000);
		await backfill();
		expect(fetchTrailer).toHaveBeenCalledTimes(1);
		vi.setSystemTime(Date.now() + 61 * 60_000);
		await backfill();
		expect(fetchTrailer).toHaveBeenCalledTimes(2);
	});

	it('stores a found trailer and never asks again', async () => {
		const api = new ApiService('', 'k');
		const fetchTrailer = vi.spyOn(api, 'fetchTrailer').mockResolvedValue({ status: 'found', value: YT('abc123456') });
		const { dm, backfill } = await open(api);
		await backfill();
		expect(dm.getTitle('Movie/Dune')!.trailerUrl).toBe(YT('abc123456'));
		await backfill();
		expect(fetchTrailer).toHaveBeenCalledTimes(1);
	});

	it('records a missing trailer as notfound', async () => {
		const api = new ApiService('', 'k');
		vi.spyOn(api, 'fetchTrailer').mockResolvedValue({ status: 'notfound' });
		const { dm, backfill } = await open(api);
		await backfill();
		expect(dm.lookupDue('Movie/Dune', 'trailer')).toBe(false);
		vi.setSystemTime(Date.now() + 8 * 24 * 3600_000);
		expect(dm.lookupDue('Movie/Dune', 'trailer')).toBe(true);
	});

	it('does not fetch twice at once', async () => {
		const api = new ApiService('', 'k');
		let release!: () => void;
		const fetchTrailer = vi.spyOn(api, 'fetchTrailer').mockImplementation(
			() => new Promise((r) => { release = () => r({ status: 'notfound' }); }),
		);
		const { backfill } = await open(api);
		const first = backfill();
		await backfill();
		release();
		await first;
		expect(fetchTrailer).toHaveBeenCalledTimes(1);
	});
});
