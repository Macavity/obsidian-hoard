import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../src/ApiService';
import type { LookupResult } from '../src/lookup';
import { answerAll, respondWith, route, sent, urlOfCall } from './helpers/apiFailures';
import { makeTitle } from './helpers/setupDataManager';

beforeEach(() => { sent.mockReset(); });

const omdb = (): ApiService => new ApiService('okey');
const tmdb = (): ApiService => new ApiService('', 'ttoken');
const both = (): ApiService => new ApiService('okey', 'ttoken');
const keyless = (): ApiService => new ApiService('');
const urls = (): string[] => sent.mock.calls.map((c) => urlOfCall(c[0]));

const IMDB_LINK = 'https://www.imdb.com/title/tt0137523/';

const TMDB_MOVIE = {
	id: 550,
	title: 'Fight Club',
	runtime: 139,
	release_date: '1999-10-15',
	videos: {
		results: [
			{ site: 'YouTube', key: 'teaser1', type: 'Teaser' },
			{ site: 'YouTube', key: 'trailer1', type: 'Trailer', official: false },
			{ site: 'YouTube', key: 'official1', type: 'Trailer', official: true },
			{ site: 'Vimeo', key: 'vimeo1', type: 'Trailer', official: true },
		],
	},
	production_companies: [{ name: 'Fox 2000 Pictures' }, { name: 'Regency Enterprises' }],
	credits: {
		crew: [{ job: 'Director', name: 'David Fincher' }, { job: 'Producer', name: 'Art Linson' }],
		cast: [{ name: 'Edward Norton' }, { name: 'Brad Pitt' }],
	},
};
const TMDB_TV = {
	id: 1396,
	name: 'Breaking Bad',
	first_air_date: '2008-01-20',
	episode_run_time: [47],
	number_of_episodes: 62,
	seasons: [
		{ season_number: 0, name: 'Specials', episode_count: 9 },
		{ season_number: 1, name: 'Season 1', episode_count: 7 },
		{ season_number: 2, name: 'Season 2', episode_count: 13 },
	],
	networks: [{ name: 'AMC' }],
	production_companies: [{ name: 'Sony Pictures Television' }],
	created_by: [{ name: 'Vince Gilligan' }],
	credits: { cast: [{ name: 'Bryan Cranston' }] },
	videos: { results: [] },
};
const TMDB_MOVIE_ROUTES: Array<[string, unknown]> = [
	['/movie/550/external_ids', { imdb_id: 'tt0137523' }],
	['/movie/550?append_to_response=videos,credits', TMDB_MOVIE],
	// the studio and trailer lookups ask the lighter endpoints
	['/movie/550/videos', TMDB_MOVIE.videos],
	['/movie/550', TMDB_MOVIE],
];
const TMDB_TV_ROUTES: Array<[string, unknown]> = [
	['/tv/1396/external_ids', { imdb_id: 'tt0903747' }],
	['/tv/1396?append_to_response=videos,credits', TMDB_TV],
	['/tv/1396/videos', TMDB_TV.videos],
	['/tv/1396', TMDB_TV],
];
const FIGHT_CLUB = {
	imdbId: '550',
	title: 'Fight Club',
	mediaType: 'movie',
	episodes: 1,
	episodeDuration: 139,
	releaseDate: '1999-10-15',
	url: 'https://www.imdb.com/title/tt0137523',
	seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
	trailerUrl: 'https://www.youtube.com/watch?v=official1',
	studio: ['Fox 2000 Pictures', 'Regency Enterprises'],
	director: ['David Fincher'],
	cast: ['Edward Norton', 'Brad Pitt'],
};
const BREAKING_BAD = {
	imdbId: '1396',
	title: 'Breaking Bad',
	mediaType: 'tv',
	episodes: 20,
	episodeDuration: 47,
	releaseDate: '2008-01-20',
	url: 'https://www.imdb.com/title/tt0903747',
	seasons: [{ name: 'Season 1', episodes: 7, offset: 0 }, { name: 'Season 2', episodes: 13, offset: 7 }],
	studio: ['AMC', 'Sony Pictures Television'],
	director: ['Vince Gilligan'],
	cast: ['Bryan Cranston'],
};

describe('OMDb search', () => {
	it('maps a page of series, keeping the start year and dropping a missing poster', async () => {
		route([['omdbapi.com/?s=', {
			Response: 'True',
			totalResults: '2',
			Search: [
				{ imdbID: 'tt5753856', Title: 'Dark', Year: '2017–2020', Poster: 'https://m.media-amazon.com/dark.jpg' },
				{ imdbID: 'tt2', Title: 'Darker', Year: '2019', Poster: 'N/A' },
			],
		}]]);
		expect(await omdb().searchOmdb('dark matter', 'series', '2017')).toEqual([
			{
				imdbId: 'tt5753856', title: 'Dark', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '2017',
				url: 'https://www.imdb.com/title/tt5753856', seasons: [], posterUrl: 'https://m.media-amazon.com/dark.jpg',
			},
			{
				imdbId: 'tt2', title: 'Darker', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '2019',
				url: 'https://www.imdb.com/title/tt2', seasons: [], posterUrl: undefined,
			},
		]);
		expect(urls()).toEqual(['https://www.omdbapi.com/?s=dark%20matter&type=series&y=2017&apikey=okey&page=1']);
	});

	it('searches movies without a year filter unless the year is four digits', async () => {
		route([['omdbapi.com/?s=', { Response: 'True', totalResults: '1', Search: [{ imdbID: 'tt1', Title: 'Heat', Year: '1995', Poster: 'N/A' }] }]]);
		const rows = await omdb().searchOmdb('heat', 'movie', '95');
		expect(rows.map((r) => [r.mediaType, r.releaseDate])).toEqual([['movie', '1995']]);
		expect(urls()).toEqual(['https://www.omdbapi.com/?s=heat&type=movie&apikey=okey&page=1']);
	});

	it('reads the next page while a page is full and stops at the reported total', async () => {
		const page = (from: number, count: number): unknown => ({
			Response: 'True',
			totalResults: '12',
			Search: Array.from({ length: count }, (_, i) => ({ imdbID: `tt${from + i}`, Title: `T${from + i}`, Year: '2000', Poster: 'N/A' })),
		});
		route([['&page=1', page(1, 10)], ['&page=2', page(11, 2)]]);
		const rows = await omdb().searchOmdb('t', 'movie');
		expect(rows.map((r) => r.imdbId)).toEqual(Array.from({ length: 12 }, (_, i) => `tt${i + 1}`));
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('does not ask for a page beyond the reported total', async () => {
		const full = (from: number): unknown => ({
			Response: 'True',
			totalResults: '20',
			Search: Array.from({ length: 10 }, (_, i) => ({ imdbID: `tt${from + i}`, Title: 'T', Year: '2000', Poster: 'N/A' })),
		});
		route([['&page=1', full(1)], ['&page=2', full(11)], ['&page=3', full(21)]]);
		expect(await omdb().searchOmdb('t', 'movie')).toHaveLength(20);
		expect(sent).toHaveBeenCalledTimes(2);
	});

	it('treats "not found" as an empty result', async () => {
		answerAll(200, '{"Response":"False","Error":"Movie not found!"}');
		expect(await omdb().searchOmdb('zzz', 'movie')).toEqual([]);
	});
});

describe('OMDb details', () => {
	const MOVIE = {
		Response: 'True', imdbID: 'tt0111161', Title: 'The Shawshank Redemption', Type: 'movie', Runtime: '142 min',
		Released: '14 Oct 1994', Year: '1994', Director: 'Frank Darabont', Actors: 'Tim Robbins, Morgan Freeman',
	};
	const SERIES = {
		Response: 'True', imdbID: 'tt0903747', Title: 'Breaking Bad', Type: 'series', totalSeasons: '2',
		Released: '20 Jan 2008', Director: 'N/A', Writer: 'Vince Gilligan (creator)', Actors: 'Bryan Cranston, Aaron Paul',
	};
	const SERIES_ROUTES: Array<[string, unknown]> = [
		['&Season=1&', { Response: 'True', Episodes: [{}, {}, {}] }],
		['&Season=2&', { Response: 'True', Episodes: [{}, {}] }],
		['?i=tt0903747&apikey', SERIES],
	];
	const SHAWSHANK = {
		imdbId: 'tt0111161', title: 'The Shawshank Redemption', mediaType: 'movie', episodes: 1, episodeDuration: 142,
		releaseDate: '1994-10-14', url: 'https://www.imdb.com/title/tt0111161', seasons: [{ name: 'Movie', episodes: 1, offset: 0 }],
		director: ['Frank Darabont'], cast: ['Tim Robbins', 'Morgan Freeman'],
	};
	const BREAKING_BAD_OMDB = {
		imdbId: 'tt0903747', title: 'Breaking Bad', mediaType: 'tv', episodes: 5, episodeDuration: 45,
		releaseDate: '2008-01-20', url: 'https://www.imdb.com/title/tt0903747',
		seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }, { name: 'Season 2', episodes: 2, offset: 3 }],
		director: ['Vince Gilligan'], cast: ['Bryan Cranston', 'Aaron Paul'],
	};

	it('maps a movie', async () => {
		route([['?i=tt0111161', MOVIE]]);
		expect(await omdb().getOmdbMovieDetails('tt0111161')).toEqual(SHAWSHANK);
		expect(urls()).toEqual(['https://www.omdbapi.com/?i=tt0111161&apikey=okey']);
	});

	it('falls back to the year, two hours and no credits when OMDb has none', async () => {
		route([['?i=tt1', { Response: 'True', imdbID: 'tt1', Title: 'X', Year: '2026', Runtime: 'N/A', Director: 'N/A' }]]);
		expect(await omdb().getOmdbMovieDetails('tt1')).toMatchObject({
			releaseDate: '2026', episodeDuration: 120, director: [], cast: [],
		});
	});

	it('keeps a release date it cannot read as it came', async () => {
		route([['?i=tt1', { Response: 'True', imdbID: 'tt1', Title: 'X', Released: '08 Foo 2026' }]]);
		expect((await omdb().getOmdbMovieDetails('tt1'))?.releaseDate).toBe('08 Foo 2026');
	});

	it('maps a series with one request per season and the creators as director', async () => {
		route(SERIES_ROUTES);
		expect(await omdb().getOmdbTvDetails('tt0903747')).toEqual(BREAKING_BAD_OMDB);
		expect(urls()).toEqual([
			'https://www.omdbapi.com/?i=tt0903747&apikey=okey',
			'https://www.omdbapi.com/?i=tt0903747&Season=1&apikey=okey',
			'https://www.omdbapi.com/?i=tt0903747&Season=2&apikey=okey',
		]);
	});

	it('stops at the first season OMDb does not know', async () => {
		route([
			['&Season=1&', { Response: 'True', Episodes: [{}] }],
			['&Season=2&', { Response: 'False' }],
			['?i=tt9&apikey', { ...SERIES, imdbID: 'tt9', totalSeasons: '3' }],
		]);
		expect((await omdb().getOmdbTvDetails('tt9'))?.seasons).toEqual([{ name: 'Season 1', episodes: 1, offset: 0 }]);
		expect(sent).toHaveBeenCalledTimes(3);
	});

	it('picks movie or series details from the type of an IMDb id', async () => {
		route([['?i=tt0111161', MOVIE], ...SERIES_ROUTES]);
		expect(await omdb().getOmdbByImdbId('tt0111161')).toEqual(SHAWSHANK);
		expect(await omdb().getOmdbByImdbId('tt0903747')).toEqual(BREAKING_BAD_OMDB);
	});

	it('answers null without a key, for an unknown id and for a failed request', async () => {
		expect(await keyless().getOmdbByImdbId('tt1')).toBeNull();
		expect(await keyless().getOmdbTvDetails('tt1')).toBeNull();
		expect(sent).not.toHaveBeenCalled();
		answerAll(200, '{"Response":"False","Error":"Incorrect IMDb ID."}');
		expect(await omdb().getOmdbByImdbId('tt1')).toBeNull();
		expect(await omdb().getOmdbTvDetails('tt1')).toBeNull();
		answerAll(500);
		expect(await omdb().getOmdbByImdbId('tt1')).toBeNull();
		expect(await omdb().getOmdbTvDetails('tt1')).toBeNull();
	});
});

describe('TMDB search and details', () => {
	it('maps a page of series and sends the token', async () => {
		route([['/search/tv?query=dark', {
			total_pages: 1,
			results: [{ id: 70523, name: 'Dark', first_air_date: '2017-12-01', poster_path: '/dark.jpg' }, { id: 5 }],
		}]]);
		expect(await tmdb().searchTmdb('dark', 'series', '2017')).toEqual([
			{
				imdbId: '70523', title: 'Dark', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '2017-12-01',
				url: '', seasons: [], posterUrl: 'https://image.tmdb.org/t/p/w342/dark.jpg',
			},
			{ imdbId: '5', title: '', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '', url: '', seasons: [], posterUrl: undefined },
		]);
		expect(sent.mock.calls.map((c) => c[0])).toEqual([{
			url: 'https://api.themoviedb.org/3/search/tv?query=dark&first_air_date_year=2017&page=1',
			headers: { Authorization: 'Bearer ttoken' },
			throw: false,
		}]);
	});

	it('searches movies by release year and reads further pages while there are some', async () => {
		route([
			['&page=1', { total_pages: 2, results: [{ id: 1, title: 'A', release_date: '2021-01-01' }] }],
			['&page=2', { total_pages: 2, results: [{ id: 2, title: 'B' }] }],
		]);
		const rows = await tmdb().searchTmdb('a b', 'movie', '2021');
		expect(rows.map((r) => [r.imdbId, r.title, r.mediaType, r.releaseDate])).toEqual([['1', 'A', 'movie', '2021-01-01'], ['2', 'B', 'movie', '']]);
		expect(urls()).toEqual([
			'https://api.themoviedb.org/3/search/movie?query=a%20b&primary_release_year=2021&page=1',
			'https://api.themoviedb.org/3/search/movie?query=a%20b&primary_release_year=2021&page=2',
		]);
	});

	it('maps a movie with its official trailer, companies and credits', async () => {
		route(TMDB_MOVIE_ROUTES);
		expect(await tmdb().getTmdbMovieDetails('550')).toEqual(FIGHT_CLUB);
	});

	it.each([
		['any trailer when none is official', [{ site: 'YouTube', key: 't', type: 'Teaser' }, { site: 'YouTube', key: 'tr', type: 'Trailer' }], 'https://www.youtube.com/watch?v=tr'],
		['a teaser when there is no trailer', [{ site: 'YouTube', key: 't', type: 'Teaser' }, { site: 'YouTube', key: 'c', type: 'Clip' }], 'https://www.youtube.com/watch?v=t'],
		['nothing from other sites or other kinds', [{ site: 'Vimeo', key: 'v', type: 'Trailer' }, { site: 'YouTube', key: 'c', type: 'Clip' }, { site: 'YouTube', type: 'Trailer' }], undefined],
	])('picks %s', async (_name, results, trailerUrl) => {
		route([['/movie/550/external_ids', {}], ['/movie/550?append', { ...TMDB_MOVIE, videos: { results } }]]);
		const detail = await tmdb().getTmdbMovieDetails('550');
		expect(detail?.trailerUrl).toBe(trailerUrl);
		expect(detail?.url).toBe('');
	});

	it('maps a series without its specials, networks before production companies', async () => {
		route(TMDB_TV_ROUTES);
		expect(await tmdb().getTmdbTvDetails('1396')).toEqual(BREAKING_BAD);
	});

	it('resolves an IMDb id to a movie first, then to a series', async () => {
		route([['/find/tt0137523', { movie_results: [{ id: 550 }], tv_results: [{ id: 1396 }] }], ...TMDB_MOVIE_ROUTES]);
		expect(await tmdb().getTmdbByImdbId('tt0137523')).toEqual(FIGHT_CLUB);
		route([['/find/tt0903747', { movie_results: [], tv_results: [{ id: 1396 }] }], ...TMDB_TV_ROUTES]);
		expect(await tmdb().getTmdbByImdbId('tt0903747')).toEqual(BREAKING_BAD);
		route([['/find/tt1', { movie_results: [], tv_results: [] }]]);
		expect(await tmdb().getTmdbByImdbId('tt1')).toBeNull();
	});

	it('answers null without a token and for a failed request', async () => {
		expect(await keyless().getTmdbMovieDetails('550')).toBeNull();
		expect(await keyless().getTmdbTvDetails('1396')).toBeNull();
		expect(sent).not.toHaveBeenCalled();
		answerAll(500);
		expect(await tmdb().getTmdbMovieDetails('550')).toBeNull();
		expect(await tmdb().getTmdbTvDetails('1396')).toBeNull();
	});
});

describe('TMDB collections', () => {
	it('finds the movie id of an IMDb id', async () => {
		route([['/find/tt0137523?external_source=imdb_id', { movie_results: [{ id: 550 }] }]]);
		expect(await tmdb().findTmdbMovieIdByImdbId('tt0137523')).toEqual({ status: 'found', value: 550 });
		route([['/find/', { movie_results: [], tv_results: [{ id: 1396 }] }]]);
		expect(await tmdb().findTmdbMovieIdByImdbId('tt0903747')).toEqual({ status: 'notfound' });
		answerAll(500);
		expect(await tmdb().findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'failed' });
		expect(await keyless().findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'nokey' });
		expect(await tmdb().findTmdbMovieIdByImdbId('')).toEqual({ status: 'notfound' });
	});

	it('searches a movie id by title and the year of a date', async () => {
		route([['/search/movie', { results: [{ id: 550 }, { id: 551 }] }]]);
		expect(await tmdb().searchTmdbMovieId('Fight Club', '1999-10-15')).toBe(550);
		expect(await tmdb().searchTmdbMovieId('Fight Club')).toBe(550);
		expect(urls()).toEqual([
			'https://api.themoviedb.org/3/search/movie?query=Fight%20Club&page=1&primary_release_year=1999',
			'https://api.themoviedb.org/3/search/movie?query=Fight%20Club&page=1',
		]);
		route([['/search/movie', { results: [] }]]);
		expect(await tmdb().searchTmdbMovieId('Nothing')).toBeNull();
		answerAll(500);
		expect(await tmdb().searchTmdbMovieId('Fight Club')).toBeNull();
		sent.mockClear();
		expect(await tmdb().searchTmdbMovieId('   ')).toBeNull();
		expect(await keyless().searchTmdbMovieId('Fight Club')).toBeNull();
		expect(sent).not.toHaveBeenCalled();
	});

	it('reads the collection a movie belongs to', async () => {
		route([['/movie/11', { id: 11, belongs_to_collection: { id: 10, name: 'Star Wars Collection' } }]]);
		expect(await tmdb().getTmdbMovieCollection(11)).toEqual({ status: 'found', value: { id: 10, name: 'Star Wars Collection' } });
		route([['/movie/550', { id: 550, belongs_to_collection: null }]]);
		expect(await tmdb().getTmdbMovieCollection(550)).toEqual({ status: 'notfound' });
		answerAll(500);
		expect(await tmdb().getTmdbMovieCollection(550)).toEqual({ status: 'failed' });
		expect(await keyless().getTmdbMovieCollection(550)).toEqual({ status: 'nokey' });
	});
});

describe('airing by TMDB id', () => {
	afterEach(() => { vi.useRealTimers(); });

	it('reads the next and the last episode of a series', async () => {
		vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'));
		route([['/tv/1396', {
			next_episode_to_air: { episode_number: 3, season_number: 2, air_date: '2026-12-01' },
			last_episode_to_air: { episode_number: 2, season_number: 2 },
		}]]);
		expect(await tmdb().fetchAiring({ tmdbId: 1396, tmdbMediaType: 'tv' })).toEqual({
			status: 'found',
			value: {
				refreshedAt: '2026-11-16T10:00:00.000Z', nextEpisode: 3, nextSeason: 2, nextAirDate: '2026-12-01', lastEpisode: 2, lastSeason: 2,
			},
		});
		expect(urls()).toEqual(['https://api.themoviedb.org/3/tv/1396']);
	});

	it('reports a finished series with only its last episode, and nothing without a token or for a movie', async () => {
		vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'));
		route([['/tv/1396', { next_episode_to_air: null, last_episode_to_air: { episode_number: 16 } }]]);
		expect(await tmdb().fetchAiring({ tmdbId: 1396, tmdbMediaType: 'tv' }))
			.toEqual({ status: 'found', value: { refreshedAt: '2026-11-16T10:00:00.000Z', lastEpisode: 16 } });
		expect(await keyless().fetchAiring({ tmdbId: 1396, tmdbMediaType: 'tv' })).toEqual({ status: 'nokey' });
		expect(await tmdb().fetchAiring({ tmdbId: 550, tmdbMediaType: 'movie' })).toEqual({ status: 'notfound' });
	});
});

describe('anime schedule', () => {
	it.each([
		['Sundays', 0], ['Mondays', 1], ['Fridays', 5], ['Saturdays', 6],
	])('maps %s to weekday %i', async (day, dayOfWeek) => {
		route([['/anime/5', { data: { broadcast: { day, time: '17:00' } } }]]);
		expect(await keyless().getAnimeScheduleByMalId(5)).toEqual({ dayOfWeek, time: '17:00' });
		expect(urls()).toEqual(['https://api.tenrai.org/v1/anime/5']);
	});

	it.each([
		['a day it does not know', { data: { broadcast: { day: 'Unknown', time: '17:00' } } }],
		['no time', { data: { broadcast: { day: 'Sundays', time: null } } }],
		['no broadcast', { data: {} }],
	])('answers null for %s', async (_name, body) => {
		route([['/anime/5', body]]);
		expect(await keyless().getAnimeScheduleByMalId(5)).toBeNull();
	});

	it('answers null when the request fails', async () => {
		answerAll(500);
		expect(await keyless().getAnimeScheduleByMalId(5)).toBeNull();
	});
});

describe('community rating', () => {
	const MAL = ['/anime/5', { data: { score: 8.5, scored_by: 1000 } }] as [string, unknown];
	const MAL_EMPTY = ['/anime/5', { data: { score: null, scored_by: null } }] as [string, unknown];
	const ANILIST = ['graphql.anilist.co', { data: { Media: { id: 9, averageScore: 85, popularity: 5000 } } }] as [string, unknown];
	const OMDB = ['omdbapi.com/?i=tt0137523', { Response: 'True', imdbRating: '8.8', imdbVotes: '1,234,567' }] as [string, unknown];
	const OMDB_EMPTY = ['omdbapi.com/?i=tt0137523', { Response: 'True', imdbRating: 'N/A', imdbVotes: 'N/A' }] as [string, unknown];
	const FIND = ['/find/tt0137523', { movie_results: [{ vote_average: 7.9, vote_count: 321 }] }] as [string, unknown];
	const anime = makeTitle({ type: 'Anime', malId: 5, anilistId: 9 });
	const movie = makeTitle({ type: 'Movie', externalLink: IMDB_LINK });

	it('asks the preferred anime source first and the other one when it has nothing', async () => {
		route([MAL, ANILIST]);
		expect(await keyless().fetchCommunityRating(anime, 'jikan')).toEqual({ rating: 8.5, votes: 1000, source: 'mal' });
		expect(await keyless().fetchCommunityRating(anime, 'anilist')).toEqual({ rating: 85, votes: 5000, source: 'anilist' });
		route([MAL_EMPTY, ANILIST]);
		expect(await keyless().fetchCommunityRating(anime, 'jikan')).toEqual({ rating: 85, votes: 5000, source: 'anilist' });
		route([MAL]);
		expect(await keyless().fetchCommunityRating(anime, 'anilist')).toEqual({ rating: 8.5, votes: 1000, source: 'mal' });
	});

	it('follows the id an anime has, whatever the preference', async () => {
		route([MAL, ANILIST]);
		expect(await keyless().fetchCommunityRating(makeTitle({ type: 'Anime', malId: 5 }), 'anilist')).toMatchObject({ source: 'mal' });
		expect(await keyless().fetchCommunityRating(makeTitle({ type: 'Anime', anilistId: 9 }), 'jikan')).toMatchObject({ source: 'anilist' });
	});

	it('uses IMDb through OMDb, then TMDB, for a movie', async () => {
		route([OMDB, FIND]);
		expect(await both().fetchCommunityRating(movie)).toEqual({ rating: 8.8, votes: 1234567, source: 'imdb' });
		expect(await tmdb().fetchCommunityRating(movie)).toEqual({ rating: 7.9, votes: 321, source: 'tmdb' });
		route([OMDB_EMPTY, FIND]);
		expect(await both().fetchCommunityRating(movie)).toEqual({ rating: 7.9, votes: 321, source: 'tmdb' });
		route([['/find/tt0137523', { movie_results: [], tv_results: [{ vote_average: 9.5, vote_count: 10 }] }]]);
		expect(await tmdb().fetchCommunityRating(movie)).toEqual({ rating: 9.5, votes: 10, source: 'tmdb' });
	});

	it('falls through to IMDb for an anime without an anime id', async () => {
		route([OMDB]);
		expect(await omdb().fetchCommunityRating(makeTitle({ type: 'Anime', externalLink: IMDB_LINK })))
			.toEqual({ rating: 8.8, votes: 1234567, source: 'imdb' });
	});

	it('lets the API group decide over the type', async () => {
		route([MAL, OMDB]);
		expect(await omdb().fetchCommunityRating(makeTitle({ type: 'Documentary', malId: 5, externalLink: IMDB_LINK }), 'jikan', 'anime'))
			.toMatchObject({ source: 'mal' });
		expect(await omdb().fetchCommunityRating(makeTitle({ type: 'Anime', malId: 5, externalLink: IMDB_LINK }), 'jikan', 'movie'))
			.toMatchObject({ source: 'imdb' });
	});

	it('answers null when nothing fits or nothing is known', async () => {
		expect(await both().fetchCommunityRating(makeTitle({ type: 'Documentary', externalLink: IMDB_LINK }))).toBeNull();
		expect(await both().fetchCommunityRating(makeTitle({ type: 'Movie' }))).toBeNull();
		expect(await keyless().fetchCommunityRating(movie)).toBeNull();
		expect(sent).not.toHaveBeenCalled();
		answerAll(500);
		expect(await both().fetchCommunityRating(movie)).toBeNull();
		expect(await keyless().fetchCommunityRating(anime)).toBeNull();
		route([['/find/tt0137523', { movie_results: [{ vote_average: 0, vote_count: 0 }] }]]);
		expect(await tmdb().fetchCommunityRating(movie)).toBeNull();
	});
});

describe('trailer', () => {
	const JIKAN = ['/anime/5', { data: { trailer: { embed_url: 'https://www.youtube.com/embed/jikan123?enablejsapi=1' } } }] as [string, unknown];
	const ANILIST = ['graphql.anilist.co', { data: { Media: { id: 9, trailer: { site: 'youtube', id: 'anilist1' } } } }] as [string, unknown];
	const anime = makeTitle({ type: 'Anime', malId: 5, anilistId: 9 });

	it('asks the preferred anime source first and the other one when it has none', async () => {
		route([JIKAN, ANILIST]);
		expect(await keyless().fetchTrailer(anime, 'jikan')).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=jikan123' });
		expect(await keyless().fetchTrailer(anime, 'anilist')).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=anilist1' });
		route([['/anime/5', { data: { trailer: null } }], ANILIST]);
		expect(await keyless().fetchTrailer(anime, 'jikan')).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=anilist1' });
		route([JIKAN, ['graphql.anilist.co', { data: { Media: { id: 9, trailer: { site: 'dailymotion', id: 'x' } } } }]]);
		expect(await keyless().fetchTrailer(anime, 'anilist')).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=jikan123' });
	});

	it('reads the video id from whatever shape Jikan sends', async () => {
		const from = async (trailer: unknown): Promise<LookupResult<string>> => {
			route([['/anime/5', { data: { trailer } }]]);
			return keyless().fetchTrailer(makeTitle({ type: 'Anime', malId: 5 }));
		};
		expect(await from({ youtube_id: 'idfield1' })).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=idfield1' });
		expect(await from({ url: 'https://www.youtube.com/watch?v=watch123' })).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=watch123' });
		expect(await from({ url: 'https://youtu.be/short123' })).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=short123' });
		expect(await from({ url: 'https://example.org/video' })).toEqual({ status: 'notfound' });
	});

	it('uses TMDB by IMDb id for a movie', async () => {
		route([['/find/tt0137523', { movie_results: [{ id: 550 }] }], ...TMDB_MOVIE_ROUTES]);
		expect(await tmdb().fetchTrailer(makeTitle({ type: 'Movie', externalLink: IMDB_LINK }))).toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=official1' });
		expect(await tmdb().fetchTrailer(makeTitle({ type: 'Documentary', externalLink: IMDB_LINK }), 'jikan', 'movie'))
			.toEqual({ status: 'found', value: 'https://www.youtube.com/watch?v=official1' });
	});

	it('answers nokey or notfound without a source, failed when it cannot be reached', async () => {
		expect(await omdb().fetchTrailer(makeTitle({ type: 'Movie', externalLink: IMDB_LINK }))).toEqual({ status: 'nokey' });
		expect(await tmdb().fetchTrailer(makeTitle({ type: 'Movie' }))).toEqual({ status: 'notfound' });
		expect(await tmdb().fetchTrailer(makeTitle({ type: 'Documentary', externalLink: IMDB_LINK }))).toEqual({ status: 'notfound' });
		expect(await keyless().fetchTrailer(makeTitle({ type: 'Anime' }))).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
		answerAll(500);
		expect(await keyless().fetchTrailer(anime)).toEqual({ status: 'failed' });
		expect(await tmdb().fetchTrailer(makeTitle({ type: 'Movie', externalLink: IMDB_LINK }))).toEqual({ status: 'failed' });
	});
});

describe('studio', () => {
	const JIKAN = ['/anime/5', { data: { studios: [{ name: 'Bones' }, { name: ' ' }] } }] as [string, unknown];
	const ANILIST = ['graphql.anilist.co', {
		data: { Media: { id: 9, studios: { edges: [{ isMain: true, node: { name: 'Madhouse' } }, { isMain: false, node: { name: 'Aniplex' } }] } } },
	}] as [string, unknown];

	it('follows the stored anime id', async () => {
		route([JIKAN, ANILIST]);
		expect(await keyless().fetchStudio(makeTitle({ malId: 5, anilistId: 9 }), 'anilist', 'anime')).toEqual({ status: 'found', value: { studio: ['Madhouse'] } });
		expect(await keyless().fetchStudio(makeTitle({ malId: 5, anilistId: 9 }), 'jikan', 'anime')).toEqual({ status: 'found', value: { studio: ['Bones'] } });
		expect(await keyless().fetchStudio(makeTitle({ anilistId: 9 }), 'jikan', 'anime')).toEqual({ status: 'found', value: { studio: ['Madhouse'] } });
		expect(await keyless().fetchStudio(makeTitle({ malId: 5 }), 'anilist', 'anime')).toEqual({ status: 'found', value: { studio: ['Bones'] } });
	});

	it('finds nothing when the anime source has no main studio, and fails when it cannot be reached', async () => {
		route([['graphql.anilist.co', { data: { Media: { id: 9, studios: { edges: [] } } } }], ['/anime/5', { data: {} }]]);
		expect(await keyless().fetchStudio(makeTitle({ anilistId: 9 }), 'anilist', 'anime')).toEqual({ status: 'notfound' });
		expect(await keyless().fetchStudio(makeTitle({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'notfound' });
		expect(await keyless().fetchStudio(makeTitle({}), 'jikan', 'anime')).toEqual({ status: 'notfound' });
		answerAll(500);
		expect(await keyless().fetchStudio(makeTitle({ malId: 5 }), 'jikan', 'anime')).toEqual({ status: 'failed' });
		expect(await keyless().fetchStudio(makeTitle({ anilistId: 9 }), 'anilist', 'anime')).toEqual({ status: 'failed' });
		expect(await keyless().fetchStudio(makeTitle({ anilistId: 9 }), 'jikan', 'anime')).toEqual({ status: 'failed' });
	});

	it('reads a movie or series by its cached TMDB id', async () => {
		route([...TMDB_MOVIE_ROUTES, ...TMDB_TV_ROUTES]);
		expect(await tmdb().fetchStudio(makeTitle({ tmdbId: 550, tmdbMediaType: 'movie' }), 'jikan', 'movie'))
			.toEqual({ status: 'found', value: { studio: ['Fox 2000 Pictures', 'Regency Enterprises'] } });
		expect(await tmdb().fetchStudio(makeTitle({ tmdbId: 1396, tmdbMediaType: 'tv' }), 'jikan', 'movie'))
			.toEqual({ status: 'found', value: { studio: ['AMC', 'Sony Pictures Television'] } });
	});

	it('resolves an IMDb link and hands back the TMDB id it found', async () => {
		route([['/find/tt0137523', { movie_results: [{ id: 550 }] }], ...TMDB_MOVIE_ROUTES]);
		expect(await tmdb().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', 'movie'))
			.toEqual({ status: 'found', value: { studio: ['Fox 2000 Pictures', 'Regency Enterprises'], tmdbId: 550, tmdbMediaType: 'movie' } });
		route([['/find/tt0137523', { movie_results: [], tv_results: [{ id: 1396 }] }], ...TMDB_TV_ROUTES]);
		expect(await tmdb().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', 'movie'))
			.toEqual({ status: 'found', value: { studio: ['AMC', 'Sony Pictures Television'], tmdbId: 1396, tmdbMediaType: 'tv' } });
	});

	it('answers nokey without a token, notfound without an id or a match', async () => {
		expect(await keyless().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', 'movie')).toEqual({ status: 'nokey' });
		expect(await tmdb().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', '')).toEqual({ status: 'notfound' });
		expect(await tmdb().fetchStudio(makeTitle({}), 'jikan', 'movie')).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
		route([['/find/tt0137523', { movie_results: [], tv_results: [] }]]);
		expect(await tmdb().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', 'movie')).toEqual({ status: 'notfound' });
		answerAll(500);
		expect(await tmdb().fetchStudio(makeTitle({ externalLink: IMDB_LINK }), 'jikan', 'movie')).toEqual({ status: 'failed' });
		expect(await tmdb().fetchStudio(makeTitle({ tmdbId: 550, tmdbMediaType: 'movie' }), 'jikan', 'movie')).toEqual({ status: 'failed' });
	});
});

describe('credits', () => {
	const movie = makeTitle({ type: 'Movie', externalLink: IMDB_LINK });

	it('reads a movie from TMDB through its credits endpoint', async () => {
		route([
			['/find/tt0137523', { movie_results: [{ id: 550 }] }],
			['/movie/550/credits', { crew: [{ job: 'Director', name: 'David Fincher' }, { job: 'Writer', name: 'Jim Uhls' }], cast: [{ name: 'Edward Norton' }] }],
		]);
		expect(await tmdb().fetchCredits(movie, 'tmdb')).toEqual({ status: 'found', value: { director: ['David Fincher'], cast: ['Edward Norton'] } });
		expect(urls()).toEqual([
			'https://api.themoviedb.org/3/find/tt0137523?external_source=imdb_id',
			'https://api.themoviedb.org/3/movie/550/credits',
		]);
	});

	it('reads a series from TMDB with its creators as director', async () => {
		route([
			['/find/tt0137523', { movie_results: [], tv_results: [{ id: 1396 }] }],
			['/tv/1396?append_to_response=credits', { created_by: [{ name: 'Vince Gilligan' }], credits: { cast: [{ name: 'Bryan Cranston' }] } }],
		]);
		expect(await tmdb().fetchCredits(movie, 'tmdb')).toEqual({ status: 'found', value: { director: ['Vince Gilligan'], cast: ['Bryan Cranston'] } });
	});

	it('asks the active source first and the other keyed one when it knows nothing', async () => {
		const OMDB_DETAIL = ['omdbapi.com/?i=tt0137523', { Response: 'True', imdbID: 'tt0137523', Type: 'movie', Director: 'David Fincher', Actors: 'Brad Pitt' }] as [string, unknown];
		const TMDB_ROUTES: Array<[string, unknown]> = [
			['/find/tt0137523', { movie_results: [{ id: 550 }] }],
			['/movie/550/credits', { crew: [{ job: 'Director', name: 'From TMDB' }], cast: [] }],
		];
		route([OMDB_DETAIL, ...TMDB_ROUTES]);
		expect(await both().fetchCredits(movie, 'omdb')).toEqual({ status: 'found', value: { director: ['David Fincher'], cast: ['Brad Pitt'] } });
		expect(await both().fetchCredits(movie, 'tmdb')).toEqual({ status: 'found', value: { director: ['From TMDB'], cast: [] } });
		route([['omdbapi.com/?i=tt0137523', { Response: 'False' }], ...TMDB_ROUTES]);
		expect(await both().fetchCredits(movie, 'omdb')).toEqual({ status: 'found', value: { director: ['From TMDB'], cast: [] } });
		expect(await both().fetchCredits(makeTitle({ type: 'Movie' }), 'omdb')).toEqual({ status: 'notfound' });
	});
});

describe('game details', () => {
	const RAWG_DETAIL = {
		id: 3498,
		name: 'Grand Theft Auto V',
		released: '2013-09-17',
		background_image: 'https://media.rawg.io/media/games/gta.jpg',
		platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'PlayStation 5' } }, { platform: {} }],
		slug: 'grand-theft-auto-v',
		developers: [{ name: 'Rockstar North' }, {}],
		publishers: [{ name: 'Rockstar Games' }, { name: 'Take-Two' }],
		tags: [{ slug: 'singleplayer', language: 'eng' }, { slug: 'multiplayer' }, { slug: 'co-op', language: 'rus' }],
	};
	const GTA_RAWG = {
		source: 'rawg', id: 3498, title: 'Grand Theft Auto V', releaseDate: '2013-09-17',
		coverUrl: 'https://media.rawg.io/media/games/gta.jpg', platforms: ['PC', 'PlayStation 5'],
		url: 'https://rawg.io/games/grand-theft-auto-v', developer: 'Rockstar North', publisher: 'Rockstar Games, Take-Two',
		singleplayer: true, coop: false, multiplayer: true,
	};
	const rawg = (): ApiService => new ApiService('', '', '', 'rkey');
	const igdb = (): ApiService => new ApiService('', '', '', '', 'iid', 'isecret');

	it('maps a RAWG game and prefers the Steam store link', async () => {
		route([
			['/games/3498/stores', { results: [
				{ store_id: 5, url: 'https://www.gog.com/game/gta' },
				{ store_id: 1, url: 'https://store.steampowered.com/app/271590' },
				{ store_id: 3, url: 'http://insecure.example.org' },
			] }],
			['/games/3498?key=rkey', RAWG_DETAIL],
		]);
		expect(await rawg().getRawgGameDetails(3498)).toEqual({ ...GTA_RAWG, storeUrl: 'https://store.steampowered.com/app/271590' });
	});

	it('takes the first https store link when none is on the priority list, and none when the stores fail', async () => {
		route([
			['/games/3498/stores', { results: [{ store_id: 3, url: 'http://insecure.example.org' }, { store_id: 7, url: 'https://www.nintendo.com/gta' }] }],
			['/games/3498?key=rkey', RAWG_DETAIL],
		]);
		expect((await rawg().getRawgGameDetails(3498))?.storeUrl).toBe('https://www.nintendo.com/gta');
		route([['/games/3498?key=rkey', RAWG_DETAIL]]);
		expect(await rawg().getRawgGameDetails(3498)).toEqual({ ...GTA_RAWG, storeUrl: '' });
	});

	it('reads co-op from the English tags and answers null for a record without a name', async () => {
		route([['/games/1/stores', { results: [] }], ['/games/1?key', { id: 1, name: 'Co', tags: [{ slug: 'online-co-op' }, { slug: 'pvp', language: 'eng' }] }]]);
		expect(await rawg().getRawgGameDetails(1)).toMatchObject({ singleplayer: false, coop: true, multiplayer: true, developer: '', publisher: '', url: '' });
		route([['/games/1/stores', { results: [] }], ['/games/1?key', { id: 1 }]]);
		expect(await rawg().getRawgGameDetails(1)).toBeNull();
	});

	it('maps an IGDB game with its companies, modes and store link', async () => {
		route([['api.igdb.com/v4/games', [{
			id: 1020,
			name: 'Grand Theft Auto V',
			first_release_date: 1379376000,
			cover: { image_id: 'co2lbd' },
			platforms: [{ name: 'PC (Microsoft Windows)' }, {}],
			url: 'https://www.igdb.com/games/grand-theft-auto-v',
			game_modes: [{ name: 'Single player' }, { name: 'Multiplayer' }, { name: 'Co-operative' }],
			websites: [{ url: 'https://www.rockstargames.com' }, { url: 'https://www.gog.com/gta' }, { url: 'https://store.steampowered.com/app/271590' }],
			involved_companies: [
				{ developer: true, company: { name: 'Rockstar North' } },
				{ publisher: true, company: { name: 'Rockstar Games' } },
				{ publisher: true, company: { name: 'Rockstar Games' } },
				{ company: { name: 'Porting House' } },
			],
		}]]]);
		expect(await igdb().getIgdbGameDetails(1020)).toEqual({
			source: 'igdb', id: 1020, title: 'Grand Theft Auto V', releaseDate: '2013-09-17',
			coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.jpg', platforms: ['PC (Microsoft Windows)'],
			url: 'https://www.igdb.com/games/grand-theft-auto-v', developer: 'Rockstar North', publisher: 'Rockstar Games',
			singleplayer: true, coop: true, multiplayer: true, storeUrl: 'https://store.steampowered.com/app/271590',
		});
		expect((sent.mock.calls[1]![0] as { body: string }).body).toBe(
			'fields name, first_release_date, cover.image_id, platforms.name, url, game_modes.name, websites.url, '
			+ 'involved_companies.developer, involved_companies.publisher, involved_companies.company.name; where id = 1020; limit 1;',
		);
	});

	it('maps a bare IGDB game and answers null when IGDB knows none', async () => {
		route([['api.igdb.com/v4/games', [{ id: 7, name: 'Bare' }]]]);
		expect(await igdb().getIgdbGameDetails(7)).toEqual({
			source: 'igdb', id: 7, title: 'Bare', releaseDate: '', coverUrl: '', platforms: [], url: '',
			developer: '', publisher: '', singleplayer: false, coop: false, multiplayer: false, storeUrl: '',
		});
		route([['api.igdb.com/v4/games', []]]);
		expect(await igdb().getIgdbGameDetails(7)).toBeNull();
		route([['api.igdb.com/v4/games', { message: 'not a list' }]]);
		expect(await igdb().getIgdbGameDetails(7)).toBeNull();
	});
});

describe('Steam id', () => {
	const steam = (): ApiService => new ApiService('', '', '', '', '', '', 'skey', '');

	it('takes a SteamID64 and a profile link as they are', async () => {
		expect(await steam().resolveSteamId(' 76561198000000000 ')).toBe('76561198000000000');
		expect(await steam().resolveSteamId('https://steamcommunity.com/profiles/76561198000000001/')).toBe('76561198000000001');
		expect(await steam().resolveSteamId('')).toBe('');
		expect(sent).not.toHaveBeenCalled();
	});

	it('resolves a vanity link or a bare name through the API', async () => {
		route([['ResolveVanityURL', { response: { success: 1, steamid: '76561197960287930' } }]]);
		expect(await steam().resolveSteamId('https://steamcommunity.com/id/gabe/')).toBe('76561197960287930');
		expect(await steam().resolveSteamId('gabe newell')).toBe('76561197960287930');
		expect(urls()).toEqual([
			'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=skey&vanityurl=gabe',
			'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=skey&vanityurl=gabe%20newell',
		]);
	});

	it('answers nothing for an unknown name, without a key and when the request fails', async () => {
		route([['ResolveVanityURL', { response: { success: 42, message: 'No match' } }]]);
		expect(await steam().resolveSteamId('nobody')).toBe('');
		route([['ResolveVanityURL', { response: { success: 42, steamid: '76561197960287930' } }]]);
		expect(await steam().resolveSteamId('nobody')).toBe('');
		route([['ResolveVanityURL', { response: { success: 1 } }]]);
		expect(await steam().resolveSteamId('nobody')).toBe('');
		respondWith(() => { throw new Error('net down'); });
		expect(await steam().resolveSteamId('gabe')).toBe('');
		sent.mockClear();
		expect(await keyless().resolveSteamId('gabe')).toBe('');
		expect(sent).not.toHaveBeenCalled();
	});
});
