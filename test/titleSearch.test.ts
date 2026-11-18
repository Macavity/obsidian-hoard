import { describe, it, expect, vi } from 'vitest';
import {
	episodesLabel,
	fillMediaFields,
	titlePickerBase,
	fetchMediaDetails,
	isAnimeResult,
	resolvePick,
	resultIdKeys,
	searchTitles,
	type TitlePick,
} from '../src/modules/watchlist/ui/titleSearch';
import type { AnimeSearchResult, MediaSearchResult } from '../src/shared/domain/types';
import { SEARCH_RESULT_LIMIT } from '../src/shared/api/ApiService';
import { fakeSettings } from './helpers/fakeSettings';

function makeDeps(rawSettings: Record<string, unknown>, keys: { omdb?: boolean; tmdb?: boolean } = {}) {
	const settings = { ...rawSettings, activeApi: rawSettings.activeApi ?? 'OMDb' };
	// legacy cases name OMDb/TMDB explicitly (or rely on the default) and test the keyed path
	const omdb = keys.omdb ?? settings.activeApi !== 'TMDB';
	const tmdb = keys.tmdb ?? settings.activeApi === 'TMDB';
	const api = {
		hasOmdbKey: vi.fn(() => omdb),
		hasTmdbKey: vi.fn(() => tmdb),
		hasGoogleBooksKey: vi.fn(() => false),
		hasRawgKey: vi.fn(() => false),
		hasIgdbCredentials: vi.fn(() => false),
		searchCinemeta: vi.fn().mockResolvedValue(['cinemeta']),
		getCinemetaDetails: vi.fn().mockResolvedValue('cinemeta-detail'),
		searchAniList: vi.fn().mockResolvedValue(['anilist']),
		searchAnime: vi.fn().mockResolvedValue(['jikan']),
		searchTmdb: vi.fn().mockResolvedValue(['tmdb']),
		searchOmdb: vi.fn().mockResolvedValue(['omdb']),
		getTmdbTvDetails: vi.fn().mockResolvedValue('tmdb-tv'),
		getOmdbTvDetails: vi.fn().mockResolvedValue('omdb-tv'),
		getTmdbMovieDetails: vi.fn().mockResolvedValue('tmdb-movie'),
		getOmdbMovieDetails: vi.fn().mockResolvedValue('omdb-movie'),
	};
	return { deps: { api: api as never, settings: fakeSettings(settings) as never }, api };
}

const media = (mediaType: 'movie' | 'tv'): MediaSearchResult => ({
	imdbId: 'tt1', title: 't', mediaType, episodes: 0, episodeDuration: 0, releaseDate: '', url: '', seasons: [],
});

describe('searchTitles', () => {
	it('returns null for a type without an API', async () => {
		const { deps } = makeDeps({ typeApiMapping: {} });
		expect(await searchTitles(deps.settings, deps.api, 'Books', 'q', '')).toBeNull();
	});

	it('uses the mapping for custom types', async () => {
		const { deps, api } = makeDeps({ typeApiMapping: { Docs: 'movie' } });
		expect(await searchTitles(deps.settings, deps.api, 'Docs', 'q', '1999')).toEqual(['omdb']);
		expect(api.searchOmdb).toHaveBeenCalledWith('q', 'series', '1999');
	});

	it('searches Jikan with the result limit by default', async () => {
		const { deps, api } = makeDeps({});
		expect(await searchTitles(deps.settings, deps.api, 'Anime', 'q', '2001')).toEqual(['jikan']);
		expect(api.searchAnime).toHaveBeenCalledWith('q', '2001', SEARCH_RESULT_LIMIT);
	});

	it('searches AniList when configured', async () => {
		const { deps, api } = makeDeps({ animeApiSource: 'anilist' });
		expect(await searchTitles(deps.settings, deps.api, 'Anime', 'q', '')).toEqual(['anilist']);
		expect(api.searchAniList).toHaveBeenCalledWith('q', '');
	});

	it('maps Movie to the movie kind on TMDB', async () => {
		const { deps, api } = makeDeps({ activeApi: 'TMDB' });
		expect(await searchTitles(deps.settings, deps.api, 'Movie', 'q', '')).toEqual(['tmdb']);
		expect(api.searchTmdb).toHaveBeenCalledWith('q', 'movie', '');
	});
});

describe('keyless routing', () => {
	it('falls back to cinemeta when OMDb has no key', async () => {
		const { deps, api } = makeDeps({ activeApi: 'OMDb' }, { omdb: false });
		expect(await searchTitles(deps.settings, deps.api, 'Movie', 'q', '')).toEqual(['cinemeta']);
		expect(api.searchCinemeta).toHaveBeenCalledWith('q', 'movie', '');
		expect(api.searchOmdb).not.toHaveBeenCalled();
	});

	it('uses OMDb once it has a key', async () => {
		const { deps, api } = makeDeps({ activeApi: 'OMDb' }, { omdb: true });
		expect(await searchTitles(deps.settings, deps.api, 'Movie', 'q', '')).toEqual(['omdb']);
		expect(api.searchCinemeta).not.toHaveBeenCalled();
	});

	it('searches cinemeta by default and fetches its details', async () => {
		const { deps, api } = makeDeps({ activeApi: 'Cinemeta' });
		expect(await searchTitles(deps.settings, deps.api, 'TV Show', 'q', '')).toEqual(['cinemeta']);
		expect(api.searchCinemeta).toHaveBeenCalledWith('q', 'series', '');
		expect(await fetchMediaDetails(deps.settings, deps.api, media('tv'))).toBe('cinemeta-detail');
		expect(api.getCinemetaDetails).toHaveBeenCalledWith('tt1', 'tv');
	});

	it('keeps the cinemeta poster in the pick only for cinemeta', async () => {
		const { deps, api } = makeDeps({ activeApi: 'Cinemeta' });
		api.getCinemetaDetails.mockResolvedValue({ ...media('movie'), posterUrl: 'https://p/1.jpg' });
		const apply = vi.fn<(p: TitlePick) => void>();
		await resolvePick(deps.settings, deps.api, media('movie'), () => true, apply);
		expect(apply.mock.calls[0]![0].posterUrl).toBe('https://p/1.jpg');
		const keyed = makeDeps({ activeApi: 'OMDb' });
		const applyKeyed = vi.fn<(p: TitlePick) => void>();
		await resolvePick(keyed.deps.settings, keyed.deps.api, media('movie'), () => true, applyKeyed);
		expect(applyKeyed.mock.calls[0]![0].posterUrl).toBeUndefined();
	});
});

describe('fetchMediaDetails', () => {
	it.each([
		['TMDB', 'tv', 'tmdb-tv'],
		['TMDB', 'movie', 'tmdb-movie'],
		['OMDb', 'tv', 'omdb-tv'],
		[undefined, 'movie', 'omdb-movie'],
	] as const)('%s %s', async (activeApi, mediaType, expected) => {
		const { deps } = makeDeps({ activeApi });
		expect(await fetchMediaDetails(deps.settings, deps.api, media(mediaType))).toBe(expected);
	});
});

describe('isAnimeResult', () => {
	it('detects anime rows by malId', () => {
		expect(isAnimeResult({ malId: 1 } as never)).toBe(true);
		expect(isAnimeResult(media('tv'))).toBe(false);
	});
});

const anime = (over: Partial<AnimeSearchResult> = {}): AnimeSearchResult => ({
	malId: 7, title: 'A', episodes: 12, duration: 24, releaseDate: '2020-01-01', url: 'u', seasons: [], ...over,
});

describe('episodesLabel', () => {
	it('uses the episode count, else the media type', () => {
		expect(episodesLabel(anime({ episodes: 0 }))).toBe('0 eps');
		expect(episodesLabel({ ...media('tv'), episodes: 8 })).toBe('8 eps');
		expect(episodesLabel(media('movie'))).toBe('movie');
	});
});

describe('resultIdKeys', () => {
	it('keys anime by MAL and AniList ids and media by the active API', () => {
		expect(resultIdKeys(anime({ anilistId: 3 }), 'omdb')).toEqual(['mal:7', 'anilist:3']);
		expect(resultIdKeys(media('tv'), 'tmdb')).toEqual(['tmdb:tv:tt1']);
		expect(resultIdKeys(media('tv'), 'omdb')).toEqual(['imdb:tt1']);
		expect(resultIdKeys(media('tv'), 'cinemeta')).toEqual(['imdb:tt1']);
	});
});

describe('resolvePick', () => {
	const full = { ...media('tv'), title: 'Full', episodeDuration: 40, director: ['D'], studio: ['S'] };

	it('applies an anime pick without fetching', async () => {
		const { deps, api } = makeDeps({});
		const apply = vi.fn();
		expect(await resolvePick(deps.settings, deps.api, anime(), () => true, apply)).toBe(true);
		expect((apply.mock.calls[0]![0] as TitlePick).animeIds).toEqual({ malId: 7, anilistId: null });
		expect(api.getOmdbTvDetails).not.toHaveBeenCalled();
	});

	it('prefers AniList ids, falls back to MAL and clears credits', async () => {
		const { deps } = makeDeps({});
		const apply = vi.fn<(p: TitlePick) => void>();
		await resolvePick(deps.settings, deps.api, anime({ anilistId: 3, trailerUrl: 'yt' }), () => true, apply);
		const pick = apply.mock.calls[0]![0];
		expect(pick.animeIds).toEqual({ malId: null, anilistId: 3 });
		expect(pick.trailer).toEqual({ status: 'found', value: 'yt' });
		expect([pick.director, pick.cast, pick.studio]).toEqual([[], [], []]);
		await resolvePick(deps.settings, deps.api, anime({ anilistId: 0 }), () => true, apply);
		expect(apply.mock.calls[1]![0].animeIds).toEqual({ malId: 7, anilistId: null });
	});

	it('applies the detail record for movie/TV rows', async () => {
		const { deps, api } = makeDeps({});
		api.getOmdbTvDetails.mockResolvedValue(full);
		const apply = vi.fn<(p: TitlePick) => void>();
		expect(await resolvePick(deps.settings, deps.api, media('tv'), () => true, apply)).toBe(true);
		expect(apply.mock.calls[0]![0]).toMatchObject({ title: 'Full', duration: 40, director: ['D'], studio: ['S'], cast: [] });
		expect(apply.mock.calls[0]![0].animeIds).toBeUndefined();
	});

	it('falls back to the search row when the detail record is missing', async () => {
		const { deps, api } = makeDeps({});
		api.getOmdbTvDetails.mockResolvedValue(null);
		const apply = vi.fn<(p: TitlePick) => void>();
		const row = { ...media('tv'), title: 'Row' };
		expect(await resolvePick(deps.settings, deps.api, row, () => true, apply)).toBe(true);
		expect(apply.mock.calls[0]![0]).toMatchObject({ title: 'Row' });
		expect(await resolvePick(deps.settings, deps.api, row, () => false, apply)).toBe(false);
		expect(apply).toHaveBeenCalledTimes(1);
	});

	it('reports a stale selection and applies nothing', async () => {
		const { deps, api } = makeDeps({});
		api.getOmdbTvDetails.mockResolvedValue(full);
		const apply = vi.fn();
		expect(await resolvePick(deps.settings, deps.api, media('tv'), () => false, apply)).toBe(false);
		expect(apply).not.toHaveBeenCalled();
	});

	it('falls back to the search row when the fetch fails', async () => {
		const { deps, api } = makeDeps({});
		api.getOmdbMovieDetails.mockRejectedValue(new Error('x'));
		const apply = vi.fn<(p: TitlePick) => void>();
		const row = { ...media('movie'), title: 'Row', episodeDuration: 99, cast: ['C'] };
		expect(await resolvePick(deps.settings, deps.api, row, () => true, apply)).toBe(true);
		expect(apply.mock.calls[0]![0]).toMatchObject({ title: 'Row', duration: 99, cast: ['C'] });
		expect(await resolvePick(deps.settings, deps.api, row, () => false, apply)).toBe(false);
		expect(apply).toHaveBeenCalledTimes(1); // a stale failure must not touch the form either
	});
});

describe('fillMediaFields', () => {
	it('copies the core values', () => {
		const target = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };
		fillMediaFields(target, { ...pickOf(), title: 'T', episodes: 3, duration: 20, releaseDate: 'd', link: 'l' });
		expect(target).toEqual({ title: 'T', episodes: 3, duration: 20, releaseDate: 'd', link: 'l' });
	});
});

describe('titlePickerBase', () => {
	it('lists the configured types', () => {
		const { deps } = makeDeps({ types: [{ name: 'Anime' }, { name: 'Movie' }] });
		const base = titlePickerBase(deps.settings, 'Movie', () => {});
		expect(base.typeSelect).toMatchObject({ names: ['Anime', 'Movie'], selected: 'Movie' });
		expect(base.withYear).toBe(true);
	});
});

function pickOf(): TitlePick {
	return { title: '', episodes: 0, duration: 0, releaseDate: '', link: '', seasons: [], trailer: undefined, director: [], cast: [], studio: [] };
}
