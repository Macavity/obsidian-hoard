import { describe, it, expect } from 'vitest';
import { titleFromProperties, titleToProperties, titleToCache } from '../../src/storage/titleCodec';
import type { EntryCache } from '../../src/storage/storageTypes';
import type { HoardTitle } from '../../src/types';
import { cacheAll, fullTitle, minimalTitle } from './titleFixtures';

// Pins what the codec returns today, value by value, so its structure can change without its behaviour.

const EMPTY: HoardTitle = {
  id: 'TV Show/X', title: 'X', type: 'TV Show', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0, notes: '',
  dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 0, episodeDuration: 0, releaseDate: null,
  externalLink: '', seasons: [], watchedEpisodes: [],
};
const decode = (properties: Record<string, unknown>, cache?: EntryCache) => titleFromProperties('TV Show/X', properties, cache);

describe('titleFromProperties', () => {
  it('reads an empty note as the defaults, with only the required keys', () => {
    const { entry, invalidFields } = decode({});
    expect(entry).toEqual(EMPTY);
    expect(Object.keys(entry)).toEqual(Object.keys(EMPTY));
    expect(invalidFields).toEqual([]);
  });

  it('takes every API field from the cache', () => {
    const { entry } = decode({ Name: 'X' }, cacheAll());
    expect(entry).toEqual({
      ...EMPTY, totalEpisodes: 3, seasons: [{ name: 'Season 1', episodes: 3, offset: 0, skippedEpisodes: [] }],
      posterUrl: 'none', trailerUrl: '', director: ['Dir'], cast: ['Cast'], studio: ['St'], communityRating: 7.5, communityVotes: 10,
      communitySource: 'imdb', communityRatingLastFetched: '2026-02-01', collectionId: 9, tmdbId: 11, tmdbMediaType: 'tv', malId: 21, anilistId: 31,
    });
  });

  it('lets the note cover win over the cached "none" marker', () => {
    expect(decode({ Cover: 'https://c/p.jpg' }, { posterUrl: 'none' }).entry.posterUrl).toBe('https://c/p.jpg');
  });

  it('lets the External ID win over cached ids of the same kind', () => {
    expect(decode({ 'External ID': 'tmdb:tv:5' }, { tmdbId: 99, tmdbMediaType: 'movie', malId: 1 }).entry)
      .toEqual({ ...EMPTY, tmdbId: 5, tmdbMediaType: 'tv', malId: 1 });
  });

  it('turns an IMDb External ID into the link only when the note has no URL', () => {
    expect(decode({ 'External ID': 'imdb:tt0113277' }).entry.externalLink).toBe('https://www.imdb.com/title/tt0113277');
    expect(decode({ 'External ID': 'imdb:tt0113277', URL: 'https://example.com/x' }).entry.externalLink).toBe('https://example.com/x');
  });

  it('reports an unreadable External ID and falls back to the URL', () => {
    const { entry, invalidFields } = decode({ 'External ID': 'garbage', URL: 'https://www.themoviedb.org/tv/70523' });
    expect(entry).toEqual({ ...EMPTY, externalLink: 'https://www.themoviedb.org/tv/70523', tmdbId: 70523, tmdbMediaType: 'tv' });
    expect(invalidFields).toEqual(['External ID']);
  });

  it('reports unreadable season lines and uses the cached seasons', () => {
    const { entry, invalidFields } = decode({ Seasons: ['nonsense'] }, { seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }] });
    expect(entry.seasons).toEqual([{ name: 'Season 1', episodes: 3, offset: 0, skippedEpisodes: [] }]);
    expect(entry.seasonsOverride).toBeUndefined();
    expect(invalidFields).toEqual(['Seasons']);
  });

  it('lets season lines in the note override the cache', () => {
    const { entry } = decode({ Seasons: ['Part 1: 5 (2,4)', 'Part 2: 3'] }, { seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }] });
    expect(entry).toEqual({
      ...EMPTY, totalEpisodes: 8, seasonsOverride: true,
      seasons: [{ name: 'Part 1', episodes: 5, offset: 0, skippedEpisodes: [2, 4] }, { name: 'Part 2', episodes: 3, offset: 5, skippedEpisodes: [] }],
    });
  });

  it('merges skipped episodes into the seasons without touching the cache it was given', () => {
    const cache: EntryCache = { seasons: [{ name: 'Season 1', episodes: 3, offset: 0 }] };
    const before = structuredClone(cache);
    const { entry } = decode({ 'Watched Episodes': 'S01E01', 'Skipped Episodes': 'S01E02' }, cache);
    expect(entry.watchedEpisodes).toEqual([1]);
    expect(entry.seasons).toEqual([{ name: 'Season 1', episodes: 3, offset: 0, skippedEpisodes: [2] }]);
    expect(cache).toEqual(before);
  });

  it('marks a completed movie as watched', () => {
    expect(titleFromProperties('Movie/Heat', { Status: 'Completed', 'Total Episodes': 1 }, undefined).entry.watchedEpisodes).toEqual([1]);
  });

  it('keeps an explicit Favorite: false', () => {
    expect(decode({ Favorite: false }).entry).toEqual({ ...EMPTY, favorite: false });
  });

  it('reads a single string as a one-name credit override', () => {
    expect(decode({ Director: 'Solo' }).entry.overrides).toEqual({ director: ['Solo'] });
  });

  it('keeps a community source the app does not know, from the note and from the cache', () => {
    expect(decode({ Director: 'Solo', 'Community Source': 'letterboxd' }).entry.overrides).toEqual({ director: ['Solo'], communitySource: 'letterboxd' });
    expect(decode({}, { communitySource: 'letterboxd' }).entry.communitySource).toBe('letterboxd');
  });

  it('keeps an empty airtime time as a value', () => {
    expect(decode({ 'Airtime Recurrence': 'daily', 'Airtime Time': '' }).entry.airtime).toEqual({ recurrence: 'daily', time: '' });
  });

  it('reports an unknown or empty recurrence and sets no airtime', () => {
    for (const rec of ['hourly', '']) {
      const { entry, invalidFields } = decode({ 'Airtime Recurrence': rec, 'Airtime Day': 2 });
      expect(entry).toEqual(EMPTY);
      expect(invalidFields).toEqual(['Airtime Recurrence']);
    }
  });

  it('reports invalid fields in reading order', () => {
    const { invalidFields } = decode({
      Status: ['x'], URL: { a: 1 }, Seasons: ['nonsense'], 'Total Episodes': 'many', Name: true, Rating: 'great', Pinned: 'yes', Groups: 5,
      'External ID': 'garbage', 'Watched Episodes': 'lots', 'Skipped Episodes': 'some', 'Airtime Recurrence': 'hourly', 'Community Rating': 'high',
    });
    expect(invalidFields).toEqual([
      'Status', 'URL', 'Seasons', 'Total Episodes', 'Name', 'Rating', 'External ID', 'Watched Episodes', 'Skipped Episodes',
      'Pinned', 'Groups', 'Community Rating', 'Airtime Recurrence',
    ]);
  });
});

describe('titleToProperties', () => {
  it('writes the properties of a full title in a fixed order', () => {
    expect(Object.keys(titleToProperties(fullTitle(), 50))).toEqual([
      'Name', 'Type', 'Status', 'Priority', 'Review', 'Rating', 'Progress', 'Total Episodes', 'Runtime', 'Date Started', 'Date Finished',
      'Date Added', 'Date Modified', 'Release Date', 'MAL ID', 'AniList ID', 'Community Rating', 'Community Votes', 'Community Source',
      'Director', 'Cast', 'Studio', 'Cover', 'Trailer', 'URL', 'Pinned', 'Favorite', 'Date Favorited', 'External ID', 'Groups', 'Maybe',
      'Watched Episodes', 'Skipped Episodes', 'Seasons', 'Added Director', 'Added Cast', 'Added Studio',
      'Airtime Recurrence', 'Airtime Day', 'Airtime Time', 'Airtime Season', 'Airtime Episode', 'Airtime Acknowledged',
    ]);
  });

  it('writes the progress and identity values of a full title', () => {
    expect(titleToProperties(fullTitle(), 50)).toMatchObject({
      'External ID': 'tmdb:tv:70523', 'Watched Episodes': 'S01E01-E02, S02E01', 'Skipped Episodes': 'S01E03',
      Seasons: ['Season 1: 8', 'Season 2: 4'], 'Date Finished': null,
    });
  });

  it('writes only the always-present properties for a minimal movie', () => {
    const properties = titleToProperties(minimalTitle(), 0);
    expect(properties).toEqual({
      Name: 'Heat', Type: 'Movie', Status: 'Plan to watch', Priority: 'Medium', Rating: 0, Progress: 0, 'Total Episodes': 1, Runtime: 0,
      'Date Started': null, 'Date Finished': null, 'Date Added': 'a', 'Date Modified': 'm',
    });
    expect(Object.keys(properties)).toEqual(['Name', 'Type', 'Status', 'Priority', 'Rating', 'Progress', 'Total Episodes', 'Runtime',
      'Date Started', 'Date Finished', 'Date Added', 'Date Modified']);
  });

  it('writes numeric zero values of optional properties', () => {
    expect(titleToProperties({ ...minimalTitle(), malId: 0, anilistId: 0, overrides: { communityRating: 0, communityVotes: 0 },
      airtime: { recurrence: 'weekly', day: 0, season: 0, episode: 0 } }, 0)).toMatchObject({
      'MAL ID': 0, 'AniList ID': 0, 'Community Rating': 0, 'Community Votes': 0, 'Airtime Day': 0, 'Airtime Season': 0, 'Airtime Episode': 0,
    });
  });

  it('writes an empty airtime time back', () => {
    expect(titleToProperties({ ...minimalTitle(), airtime: { recurrence: 'daily', time: '' } }, 0))
      .toMatchObject({ 'Airtime Recurrence': 'daily', 'Airtime Time': '' });
  });
});

describe('titleToCache', () => {
  it('returns nothing for a title without API data', () => {
    expect(titleToCache(minimalTitle())).toEqual({});
  });

  it('returns the API fields in a fixed order, the poster only as the "none" marker', () => {
    const cache = titleToCache({
      ...fullTitle(), seasonsOverride: false, posterUrl: 'none', trailerUrl: 'https://youtu.be/t', director: ['Dir'], cast: ['Cast'],
      studio: ['St'], communityRating: 7, communityVotes: 3, communitySource: 'imdb', communityRatingLastFetched: 'f', collectionId: 4,
    });
    expect(cache).toEqual({
      posterUrl: 'none', trailerUrl: 'https://youtu.be/t', director: ['Dir'], cast: ['Cast'], studio: ['St'], communityRating: 7,
      communityVotes: 3, communitySource: 'imdb', communityRatingLastFetched: 'f', collectionId: 4, tmdbId: 70523, tmdbMediaType: 'tv',
      malId: 5, anilistId: 6, seasons: [{ name: 'Season 1', episodes: 8, offset: 0 }, { name: 'Season 2', episodes: 4, offset: 8 }],
    });
    expect(Object.keys(cache)).toEqual(['posterUrl', 'trailerUrl', 'director', 'cast', 'studio', 'communityRating', 'communityVotes',
      'communitySource', 'communityRatingLastFetched', 'collectionId', 'tmdbId', 'tmdbMediaType', 'malId', 'anilistId', 'seasons']);
  });

  it('keeps zero and empty values that mean "checked, nothing there"', () => {
    expect(titleToCache({ ...minimalTitle(), trailerUrl: '', communityRating: 0, communityVotes: 0, collectionId: 0, tmdbId: 0, malId: 0, anilistId: 0 }))
      .toEqual({ trailerUrl: '', communityRating: 0, communityVotes: 0, collectionId: 0, tmdbId: 0, malId: 0, anilistId: 0 });
  });

  it('keeps a real poster URL and overridden seasons out of the cache', () => {
    const cache = titleToCache(fullTitle());
    expect(cache.posterUrl).toBeUndefined();
    expect(cache.seasons).toBeUndefined();
  });
});
