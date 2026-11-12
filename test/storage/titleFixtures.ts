import type { HoardTitle } from '../../src/types';
import type { EntryCache } from '../../src/storage/storageTypes';

/** A series with every optional field set. */
export const fullTitle = (): HoardTitle => ({
  id: 'TV Show/Dark', title: 'Dark', type: 'TV Show', status: 'Watching', priority: 'High', review: 'Great', rating: 4,
  notes: '', dateStarted: '2026-01-02', dateFinished: null, dateAdded: '2026-01-01T00:00:00Z', dateModified: '2026-01-03T00:00:00Z',
  totalEpisodes: 12, episodeDuration: 55, releaseDate: '2017-12-01', externalLink: 'https://www.themoviedb.org/tv/70523',
  seasons: [{ name: 'Season 1', episodes: 8, offset: 0, skippedEpisodes: [3] }, { name: 'Season 2', episodes: 4, offset: 8, skippedEpisodes: [] }],
  seasonsOverride: true, watchedEpisodes: [1, 2, 9], tmdbId: 70523, tmdbMediaType: 'tv', malId: 5, anilistId: 6,
  posterUrl: 'https://img.example/p.jpg', manualTrailerUrl: 'https://youtu.be/x',
  overrides: { director: ['D'], cast: ['C'], studio: ['S'], communityRating: 8.1, communityVotes: 100, communitySource: 'tmdb' },
  manualDirector: ['MD'], manualCast: ['MC'], manualStudio: ['MS'], pinned: true, favorite: true,
  dateFavorited: '2026-01-04T00:00:00Z', maybe: true, groups: ['G'],
  airtime: { recurrence: 'weekly', day: 3, time: '18:00', season: 2, episode: 4, acknowledged: '2026-10-01' },
});

/** A movie with only the required fields. */
export const minimalTitle = (): HoardTitle => ({
  id: 'Movie/Heat', title: 'Heat', type: 'Movie', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0, notes: '',
  dateStarted: null, dateFinished: null, dateAdded: 'a', dateModified: 'm', totalEpisodes: 1, episodeDuration: 0, releaseDate: null,
  externalLink: '', seasons: [], watchedEpisodes: [],
});

/** A cache entry with every key the title codec owns. */
export const cacheAll = (): EntryCache => ({
  posterUrl: 'none', trailerUrl: '', director: ['Dir'], cast: ['Cast'], studio: ['St'], communityRating: 7.5, communityVotes: 10,
  communitySource: 'imdb', communityRatingLastFetched: '2026-02-01', collectionId: 9, tmdbId: 11, tmdbMediaType: 'tv',
  malId: 21, anilistId: 31, seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }],
});
