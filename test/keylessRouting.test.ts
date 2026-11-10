import { describe, it, expect, vi } from 'vitest';
import { effectiveMediaSource } from '../src/apiSources';
import { LibraryIndex } from '../src/LibraryIndex';
import { resultIdKeys } from '../src/titleSearch';
import type HoardPlugin from '../src/main';
import type { MediaSearchResult } from '../src/types';

const row: MediaSearchResult = {
	imdbId: 'tt0903747', title: 'Breaking Bad', mediaType: 'tv', episodes: 0, episodeDuration: 0, releaseDate: '', url: '', seasons: [],
};

describe('keyless watchlist routing', () => {
	it('keys a Cinemeta row by imdb id even when TMDB is chosen without a key', () => {
		const api = { hasOmdbKey: () => false, hasTmdbKey: () => false } as never;
		const source = effectiveMediaSource({ activeApi: 'TMDB' }, api);
		expect(source).toBe('cinemeta');
		expect(resultIdKeys(row, source)).toEqual(['imdb:tt0903747']);
	});

	it('finds the stored note with that External ID as already in the library', () => {
		const titles = [{ title: 'Other', malId: '', anilistId: '', tmdbId: '', tmdbMediaType: '', externalLink: 'https://www.imdb.com/title/tt0903747/' }];
		const plugin = { dataManager: { getTitles: vi.fn(() => titles) } } as unknown as HoardPlugin;
		const idx = LibraryIndex.build(plugin, ['watchlist']);
		expect(idx.lookup(['imdb:tt0903747'], 'Unrelated')).toBe('Watchlist');
	});
});
