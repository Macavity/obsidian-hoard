import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWatchlistAddProvider } from '../src/modules/watchlist/ui/watchlistAddProvider';
import { t } from '../src/shared/i18n';
import { fakeSettings } from './helpers/fakeSettings';
import { shownNotices } from './helpers/csvWizard';
import type { AnimeSearchResult, HoardTitle, MediaSearchResult } from '../src/modules/watchlist/domain/model';

const media = (over: Partial<MediaSearchResult> = {}): MediaSearchResult => ({
	imdbId: 'tt1', title: 'Inception', mediaType: 'movie', episodes: 1, episodeDuration: 148, releaseDate: '2010-07-16',
	url: 'https://imdb.test/tt1', seasons: [], ...over,
});
const anime = (over: Partial<AnimeSearchResult> = {}): AnimeSearchResult => ({
	malId: 52991, title: 'Frieren', episodes: 28, duration: 24, releaseDate: '2023-09-29', url: 'https://myanimelist.net/anime/52991',
	seasons: [], ...over,
});

function setup(activeApi: 'TMDB' | 'OMDb' | 'Cinemeta' = 'Cinemeta', hasKey = false, stored: Array<Partial<HoardTitle>> = []) {
	const api = {
		hasOmdbKey: () => hasKey,
		hasTmdbKey: () => hasKey,
		searchAniList: vi.fn(() => Promise.resolve<AnimeSearchResult[]>([])),
		searchAnime: vi.fn(() => Promise.resolve<AnimeSearchResult[]>([anime()])),
		searchTmdb: vi.fn(() => Promise.resolve<MediaSearchResult[]>([])),
		searchOmdb: vi.fn(() => Promise.resolve<MediaSearchResult[]>([])),
		searchCinemeta: vi.fn(() => Promise.resolve<MediaSearchResult[]>([media()])),
		getCinemetaDetails: vi.fn((_id: string, kind: string) => Promise.resolve<MediaSearchResult | null>(kind === 'tv' ? media({ mediaType: 'tv' }) : null)),
		getTmdbMovieDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(media())),
		getTmdbTvDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(media({ mediaType: 'tv' }))),
		getOmdbMovieDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(null)),
		getOmdbTvDetails: vi.fn(() => Promise.resolve<MediaSearchResult | null>(null)),
		getTmdbByImdbId: vi.fn(() => Promise.resolve<MediaSearchResult | null>(media())),
		getOmdbByImdbId: vi.fn(() => Promise.resolve<MediaSearchResult | null>(media({ mediaType: 'tv' }))),
		getAnimeByMalId: vi.fn(() => Promise.resolve<AnimeSearchResult | null>(anime())),
		getAniListAnimeById: vi.fn(() => Promise.resolve<AnimeSearchResult | null>(anime({ malId: 0, anilistId: 154587, url: 'https://anilist.co/anime/154587' }))),
		fetchCommunityRating: vi.fn(),
	};
	const settings = fakeSettings({ activeApi, animeApiSource: 'jikan', types: [], statuses: [], priorities: [] });
	const titles = { getTitles: () => stored as HoardTitle[], getGroups: () => [] };
	const provider = createWatchlistAddProvider({ settings: settings as never, titles: titles as never, api });
	return { provider, api };
}

beforeEach(() => { shownNotices.length = 0; });

describe('watchlist add provider', () => {
	it('serves anime, series and movies, also as Maybe notes', () => {
		const { provider } = setup();
		expect(provider.kinds).toEqual(['anime', 'series', 'movie']);
		expect(provider.maybeKinds).toEqual(['anime', 'series', 'movie']);
	});

	it('series kind searches Cinemeta series keyless', async () => {
		const { provider, api } = setup('TMDB', false);
		const hits = await provider.search('series', 'Dark');
		expect(api.searchCinemeta).toHaveBeenCalledWith('Dark', 'series', '');
		expect(api.searchTmdb).not.toHaveBeenCalled();
		expect(hits).toHaveLength(1);
		expect(hits[0]).toMatchObject({ kind: 'series', title: 'Inception' });
	});

	it('maps anime and movie kinds to their Source Type search', async () => {
		const { provider, api } = setup();
		await provider.search('anime', 'Frieren');
		expect(api.searchAnime).toHaveBeenCalledWith('Frieren', '', 27);
		await provider.search('movie', 'Matrix');
		expect(api.searchCinemeta).toHaveBeenCalledWith('Matrix', 'movie', '');
	});

	it('hit meta and inLibrary come from the watchlist only', async () => {
		const { provider } = setup('Cinemeta', false, [{ title: 'Other', malId: 52991 }]);
		const [hit] = await provider.search('anime', 'Frieren');
		expect(hit).toMatchObject({
			kind: 'anime', title: 'Frieren', meta: `${t('misc.titleSearch.episodes', { count: 28 })} · 2023-09-29`, inLibrary: 'Watchlist',
		});
		const [fresh] = await provider.search('movie', 'Inception');
		expect(fresh!.inLibrary).toBeNull();
	});

	it('keeps its own thumbnail and fallback icon', async () => {
		const { provider, api } = setup();
		api.searchCinemeta.mockResolvedValueOnce([media({ posterUrl: 'https://img.test/p.jpg' })]);
		const [hit] = await provider.search('movie', 'x');
		expect(hit!.thumbUrl).toBe('https://img.test/p.jpg');
		expect(hit!.fallbackIcon).not.toBe('');
	});

	it('returns null at once for text that is no link, without any request', async () => {
		const { provider, api } = setup();
		expect(await provider.resolveUrl!('Inception')).toBeNull();
		expect(await provider.resolveUrl!('https://example.com/tt123')).toBeNull();
		expect(await provider.resolveUrl!('https://www.themoviedb.org/person/1')).toBeNull();
		for (const fn of Object.values(api)) {
			if (typeof fn === 'function' && 'mock' in fn) expect(fn).not.toHaveBeenCalled();
		}
	});

	it('IMDb link resolves to a hit', async () => {
		const { provider, api } = setup('TMDB', true);
		const hit = await provider.resolveUrl!('https://www.imdb.com/title/tt1375666/');
		expect(api.getTmdbByImdbId).toHaveBeenCalledWith('tt1375666');
		expect(hit).toMatchObject({ kind: 'movie', title: 'Inception' });
	});

	it('IMDb link uses OMDb when that is the keyed source and maps a series', async () => {
		const { provider, api } = setup('OMDb', true);
		const hit = await provider.resolveUrl!('https://www.imdb.com/title/tt0944947/');
		expect(api.getOmdbByImdbId).toHaveBeenCalledWith('tt0944947');
		expect(hit!.kind).toBe('series');
	});

	it('IMDb link on Cinemeta tries series first, then movie', async () => {
		const { provider, api } = setup('Cinemeta', false);
		const hit = await provider.resolveUrl!('https://www.imdb.com/title/tt0944947/');
		expect(api.getCinemetaDetails).toHaveBeenNthCalledWith(1, 'tt0944947', 'tv');
		expect(hit!.kind).toBe('series');
		api.getCinemetaDetails.mockImplementation((_id: string, kind: string) =>
			Promise.resolve(kind === 'movie' ? media({ title: 'Foreign Film' }) : null));
		expect((await provider.resolveUrl!('https://www.imdb.com/title/tt1/'))!.title).toBe('Foreign Film');
	});

	it('IMDb link not found yields no hit', async () => {
		const { provider, api } = setup('TMDB', true);
		api.getTmdbByImdbId.mockResolvedValueOnce(null);
		expect(await provider.resolveUrl!('https://www.imdb.com/title/tt9/')).toBeNull();
	});

	it('TMDB movie and tv links resolve by id and media type', async () => {
		const { provider, api } = setup('TMDB', true);
		const movie = await provider.resolveUrl!('https://www.themoviedb.org/movie/27205-inception?language=en');
		expect(api.getTmdbMovieDetails).toHaveBeenCalledWith('27205');
		expect(movie!.kind).toBe('movie');
		const tv = await provider.resolveUrl!('https://www.themoviedb.org/TV/1396');
		expect(api.getTmdbTvDetails).toHaveBeenCalledWith('1396');
		expect(tv!.kind).toBe('series');
	});

	it('TMDB link without key yields no hit', async () => {
		const { provider, api } = setup('TMDB', false);
		expect(await provider.resolveUrl!('https://www.themoviedb.org/movie/27205')).toBeNull();
		expect(api.getTmdbMovieDetails).not.toHaveBeenCalled();
		expect(shownNotices).toContain(t('add.url.noTmdbKey'));
	});

	it('lets a failing lookup reject so the wizard can skip it', async () => {
		const { provider, api } = setup('TMDB', true);
		api.getTmdbByImdbId.mockRejectedValueOnce(new Error('boom'));
		await expect(provider.resolveUrl!('https://www.imdb.com/title/tt1/')).rejects.toThrow('boom');
	});

	it('MyAnimeList anime link resolves via getAnimeByMalId', async () => {
		const { provider, api } = setup();
		const hit = await provider.resolveUrl!('https://myanimelist.net/anime/52991/Sousou_no_Frieren');
		expect(api.getAnimeByMalId).toHaveBeenCalledWith(52991);
		expect(hit).toMatchObject({ kind: 'anime', title: 'Frieren' });
	});

	it('AniList anime link resolves via getAniListAnimeById', async () => {
		const { provider, api } = setup();
		const hit = await provider.resolveUrl!('https://anilist.co/anime/154587/Sousou-no-Frieren/');
		expect(api.getAniListAnimeById).toHaveBeenCalledWith(154587);
		expect(hit).toMatchObject({ kind: 'anime', title: 'Frieren' });
	});

	it('manga links are not the watchlist link kind', async () => {
		const { provider, api } = setup();
		expect(await provider.resolveUrl!('https://myanimelist.net/manga/2/Berserk')).toBeNull();
		expect(api.getAnimeByMalId).not.toHaveBeenCalled();
	});

	it('renders a manual form for a kind', () => {
		const { provider } = setup();
		const host = document.createElement('div');
		const handle = provider.renderForm(host, {
			kind: 'movie', hit: null, query: 'Alien', target: 'library', back: () => {}, done: () => {},
		});
		expect(host.querySelector('.hoard-modal__btn-row')).not.toBeNull();
		handle.destroy();
	});

	it('renders the form of a searched hit with the hit\'s values', async () => {
		const { provider } = setup();
		const [hit] = await provider.search('movie', 'Inception');
		const host = document.createElement('div');
		provider.renderForm(host, { kind: 'movie', hit: hit!, query: 'Inc', target: 'library', back: () => {}, done: () => {} });
		await vi.waitFor(() => expect(host.querySelector('.hoard-modal__btn-row')).not.toBeNull());
		expect(host.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe('Inception');
	});
});
