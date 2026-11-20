import { describe, expect, it, vi } from 'vitest';
import { resolveCollection } from '../src/modules/watchlist/ui/CollectionModal';
import type { HoardTitle, TmdbCollectionDetail } from '../src/modules/watchlist/domain/model';
import { COLLECTION_NONE } from '../src/modules/watchlist/domain/titleHelpers';
import { DEFAULT_SETTINGS } from '../src/modules/settings/domain/settingsDefaults';
import { fakeSettings } from './helpers/fakeSettings';
import { FAILED, NO_KEY, NOT_FOUND, found, type LookupResult } from '../src/shared/api/lookup';

const detail: TmdbCollectionDetail = { id: 99, name: 'Dune Collection', parts: [] };

const title = (over: Partial<HoardTitle> = {}): HoardTitle => ({
	id: 'Movie/Dune', title: 'Dune', type: 'Movie', sourceType: 'Movie', status: '', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 155,
	releaseDate: '2021-10-22', externalLink: 'https://www.imdb.com/title/tt1160419/', seasons: [], watchedEpisodes: [], ...over,
});

interface Opts {
	hasKey?: boolean;
	movieId?: LookupResult<number>;
	search?: number | null;
	collection?: LookupResult<{ id: number; name: string }>;
}

function setup(opts: Opts = {}) {
	const api = {
		hasTmdbKey: () => opts.hasKey ?? true,
		findTmdbMovieIdByImdbId: vi.fn(() => Promise.resolve(opts.movieId ?? found(438631))),
		searchTmdbMovieId: vi.fn(() => Promise.resolve(opts.search ?? null)),
		getTmdbMovieCollection: vi.fn(() => Promise.resolve(opts.collection ?? found({ id: 99, name: 'Dune Collection' }))),
		getTmdbCollection: vi.fn(() => Promise.resolve(detail)),
	};
	const updateTmdbIdentity = vi.fn();
	const settings = fakeSettings(DEFAULT_SETTINGS);
	return { api, updateTmdbIdentity, resolve: (t: HoardTitle) => resolveCollection(settings, { updateTmdbIdentity }, api, t) };
}

describe('resolveCollection', () => {
	it('does nothing without a TMDB key', async () => {
		const { resolve, api } = setup({ hasKey: false });
		expect(await resolve(title())).toBeNull();
		expect(api.findTmdbMovieIdByImdbId).not.toHaveBeenCalled();
	});

	it('skips titles that are not movies', async () => {
		const { resolve, api } = setup();
		expect(await resolve(title({ type: 'Anime', sourceType: 'Anime' }))).toBeNull();
		expect(api.findTmdbMovieIdByImdbId).not.toHaveBeenCalled();
	});

	it('skips a title already known to have no collection', async () => {
		const { resolve, api } = setup();
		expect(await resolve(title({ collectionId: COLLECTION_NONE }))).toBeNull();
		expect(api.getTmdbCollection).not.toHaveBeenCalled();
	});

	it('loads a known collection directly', async () => {
		const { resolve, api, updateTmdbIdentity } = setup();
		expect(await resolve(title({ collectionId: 99 }))).toBe(detail);
		expect(api.getTmdbCollection).toHaveBeenCalledWith(99);
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
	});

	it('uses the stored movie id without a /find', async () => {
		const { resolve, api, updateTmdbIdentity } = setup();
		expect(await resolve(title({ tmdbId: 7, tmdbMediaType: 'movie' }))).toBe(detail);
		expect(api.findTmdbMovieIdByImdbId).not.toHaveBeenCalled();
		expect(api.getTmdbMovieCollection).toHaveBeenCalledWith(7);
		expect(updateTmdbIdentity).toHaveBeenCalledWith('Movie/Dune', 7, 99);
	});

	it('ignores a stored tv id and asks /find instead', async () => {
		const { resolve, api } = setup();
		await resolve(title({ tmdbId: 7, tmdbMediaType: 'tv' }));
		expect(api.findTmdbMovieIdByImdbId).toHaveBeenCalledWith('tt1160419');
		expect(api.getTmdbMovieCollection).toHaveBeenCalledWith(438631);
	});

	it('resolves through /find, caches the ids and loads the collection', async () => {
		const { resolve, updateTmdbIdentity } = setup();
		expect(await resolve(title())).toBe(detail);
		expect(updateTmdbIdentity).toHaveBeenCalledWith('Movie/Dune', 438631, 99);
	});

	it('caches nothing when /find failed', async () => {
		const { resolve, updateTmdbIdentity, api } = setup({ movieId: FAILED });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
		expect(api.getTmdbMovieCollection).not.toHaveBeenCalled();
	});

	it('caches nothing when /find has no usable key', async () => {
		const { resolve, updateTmdbIdentity } = setup({ movieId: NO_KEY });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
	});

	it('caches COLLECTION_NONE when /find says it is not a movie', async () => {
		const { resolve, updateTmdbIdentity, api } = setup({ movieId: NOT_FOUND });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).toHaveBeenCalledWith('Movie/Dune', null, COLLECTION_NONE);
		expect(api.getTmdbMovieCollection).not.toHaveBeenCalled();
	});

	it('falls back to the title search without an IMDb link', async () => {
		const { resolve, api, updateTmdbIdentity } = setup({ search: 55 });
		expect(await resolve(title({ externalLink: undefined }))).toBe(detail);
		expect(api.searchTmdbMovieId).toHaveBeenCalledWith('Dune', '2021-10-22');
		expect(updateTmdbIdentity).toHaveBeenCalledWith('Movie/Dune', 55, 99);
	});

	it('caches nothing when the title search finds no movie', async () => {
		const { resolve, api, updateTmdbIdentity } = setup({ search: null });
		expect(await resolve(title({ externalLink: undefined, releaseDate: null }))).toBeNull();
		expect(api.searchTmdbMovieId).toHaveBeenCalledWith('Dune', '');
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
	});

	it('caches COLLECTION_NONE with the id when the movie belongs to no collection', async () => {
		const { resolve, updateTmdbIdentity } = setup({ collection: NOT_FOUND });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).toHaveBeenCalledWith('Movie/Dune', 438631, COLLECTION_NONE);
	});

	it('caches nothing when the collection lookup failed', async () => {
		const { resolve, updateTmdbIdentity } = setup({ collection: FAILED });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
	});

	it('caches nothing when the collection lookup has no usable key', async () => {
		const { resolve, updateTmdbIdentity } = setup({ collection: NO_KEY });
		expect(await resolve(title())).toBeNull();
		expect(updateTmdbIdentity).not.toHaveBeenCalled();
	});
});
