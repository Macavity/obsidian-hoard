import { describe, it, expect } from 'vitest';
import { decodeTitle, encodeTitle, splitCache } from '../../src/storage/titleCodec';
import { ALL_PROPERTY_NAMES } from '../../src/storage/properties';
import type { HoardTitle } from '../../src/types';
const seasons = [{ name: 'Season 1', episodes: 8, offset: 0 }, { name: 'Season 2', episodes: 8, offset: 8 }];
const fullTitle = (): HoardTitle => ({
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

describe('titleCodec', () => {
  it('writes only frozen property names and reads them back', () => {
    const title = fullTitle();
    const fm = encodeTitle(title, 50);
    for (const key of Object.keys(fm)) expect(ALL_PROPERTY_NAMES).toContain(key);
    expect(fm).toMatchObject({
      Name: title.title, 'Date Added': title.dateAdded, Progress: 50, Runtime: title.episodeDuration, URL: title.externalLink,
      Cover: title.posterUrl, Trailer: title.manualTrailerUrl, 'Added Director': ['MD'], 'Community Rating': 8.1,
    });
    expect(decodeTitle(title.id, fm, splitCache(title)).entry).toEqual(title);
  });
  it('decodes an original-plugin movie note', () => {
    const { entry, invalidFields } = decodeTitle('Movie/Das doppelte Lottchen', {
      Name: 'Das doppelte Lottchen', Type: 'Movie', Status: 'Completed', Priority: 'Medium', Rating: 4,
      Progress: 100, 'Total Episodes': 1, Runtime: 89, 'Date Started': '2026-10-09', 'Date Finished': null,
      'Date Added': '2026-10-17T10:16:25.529Z', 'Date Modified': '2026-10-17T10:16:25.529Z', 'Release Date': '2017-04-16',
      'URL': 'https://www.imdb.com/title/tt5843312',
    }, undefined);
    expect(invalidFields).toEqual([]);
    expect(entry.id).toBe('Movie/Das doppelte Lottchen');
    expect(entry.watchedEpisodes).toEqual([1]); // Completed movie
    expect(encodeTitle(entry, 100)).not.toHaveProperty('Watched Episodes');
    expect(encodeTitle(entry, 100)['External ID']).toBe('imdb:tt5843312');
  });
  it('round-trips series progress via cache seasons', () => {
    const fm = { Name: 'Dark', Type: 'TV Show', Status: 'Watching', 'External ID': 'tmdb:tv:70523',
      'Watched Episodes': 'S01E01-E08, S02E01-E02', 'Skipped Episodes': 'S02E05', 'Date Added': '2026-01-01T00:00:00Z', 'Date Modified': '2026-01-01T00:00:00Z' };
    const { entry } = decodeTitle('TV Show/Dark', fm, { seasons });
    expect(entry.watchedEpisodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(entry.seasons[1]!.skippedEpisodes).toEqual([5]);
    const out = encodeTitle(entry, 66);
    expect(out['Watched Episodes']).toBe('S01E01-E08, S02E01-E02');
    expect(out).not.toHaveProperty('Seasons');
    expect(splitCache(entry).seasons).toEqual(seasons); // cache seasons carry no skippedEpisodes (those live in the note)
  });
  it('reads a missing priority as Medium and keeps an explicit empty one', () => {
    expect(decodeTitle('TV Show/P', { Name: 'P', Type: 'TV Show' }, undefined).entry.priority).toBe('Medium');
    const { entry } = decodeTitle('TV Show/P', { Name: 'P', Type: 'TV Show', Priority: 'High' }, undefined);
    entry.priority = '';
    const out = encodeTitle(entry, 0);
    expect(out.Priority).toBe('');
    expect(decodeTitle('TV Show/P', out, undefined).entry.priority).toBe('');
  });
  it('writes seasons only on override', () => {
    const { entry } = decodeTitle('Anime/X', { Name: 'X', Type: 'Anime', Seasons: ['Season 1: 12'], 'Watched Episodes': 'S01E01-E03' }, undefined);
    expect(entry.seasonsOverride).toBe(true);
    expect(encodeTitle(entry, 25).Seasons).toEqual(['Season 1: 12']);
  });
  it('flags invalid fields without throwing', () => {
    const { entry, invalidFields } = decodeTitle('TV Show/Y', { Name: 'Y', Rating: 'great', 'Watched Episodes': 'lots' }, undefined);
    expect(entry.rating).toBe(0);
    expect(invalidFields).toEqual(expect.arrayContaining(['Rating', 'Watched Episodes']));
  });
  it('maps maybe, groups and airtime', () => {
    const { entry } = decodeTitle('TV Show/Z', { Name: 'Z', Maybe: true, Groups: ['Marvel'],
      'Airtime Recurrence': 'weekly', 'Airtime Day': 3, 'Airtime Time': '18:00', 'Airtime Episode': 4 }, undefined);
    expect(entry.maybe).toBe(true);
    expect(entry.airtime).toEqual({ recurrence: 'weekly', day: 3, time: '18:00', episode: 4 });
    expect(encodeTitle(entry, 0)).toMatchObject({ Maybe: true, Groups: ['Marvel'], 'Airtime Recurrence': 'weekly' });
  });
  it('keeps refs outside the known seasons and writes them back unchanged', () => {
    const s1 = [{ name: 'Season 1', episodes: 8, offset: 0 }];
    const fm = { Name: 'Dark', Type: 'TV Show', Status: 'Watching', 'External ID': 'tmdb:tv:70523',
      'Watched Episodes': 'S01E01-E08, S02E01', 'Skipped Episodes': 'S03E02' };
    const { entry, invalidFields } = decodeTitle('TV Show/Dark', fm, { seasons: s1 });
    expect(invalidFields).toEqual([]);
    expect(entry.watchedEpisodes).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    entry.watchedEpisodes = entry.watchedEpisodes.filter((e) => e !== 1);
    const out = encodeTitle(entry, 50);
    expect(out['Watched Episodes']).toBe('S01E02-E08, S02E01');
    expect(out['Skipped Episodes']).toBe('S03E02');
    expect(splitCache(entry)).not.toHaveProperty('unmappedWatched');
  });
  it('marks out-of-range episode numbers invalid', () => {
    const s1 = [{ name: 'Season 1', episodes: 8, offset: 0 }];
    const beyond = decodeTitle('TV Show/A', { Name: 'A', 'Watched Episodes': 'S01E09', 'Skipped Episodes': 'S01E10' }, { seasons: s1 });
    expect(beyond.invalidFields).toEqual([]);
    expect(beyond.entry.unmappedWatched).toEqual([{ season: 1, episode: 9 }]);
    expect(beyond.entry.unmappedSkipped).toEqual([{ season: 1, episode: 10 }]);
    expect(beyond.entry.seasons[0]?.skippedEpisodes).toEqual([]);
    expect(decodeTitle('TV Show/A', { Name: 'A', 'Watched Episodes': 'S01E10001' }, undefined).invalidFields).toContain('Watched Episodes');
    expect(decodeTitle('TV Show/A', { Name: 'A', Seasons: ['Season 1: 12 (13)'] }, undefined).invalidFields).toContain('Seasons');
    expect(decodeTitle('TV Show/A', { Name: 'A', Seasons: ['Season 1: 20000 (1-10001)'] }, undefined).invalidFields).toContain('Seasons');
    expect(decodeTitle('TV Show/A', { Name: 'A', Seasons: ['Season 1: 12 (3, 5-6)'] }, undefined).invalidFields).toEqual([]);
  });

  describe('series without a season list', () => {
    const fm = { Name: 'N', Type: 'TV Show', 'Total Episodes': 10, 'Watched Episodes': 'S01E01-E05, S02E01', 'Skipped Episodes': 'S01E09' };

    it('maps progress onto an implicit S01 of totalEpisodes', () => {
      const { entry, invalidFields } = decodeTitle('TV Show/N', fm, undefined);
      expect(invalidFields).toEqual([]);
      expect(entry.seasons).toEqual([]);
      expect(entry.watchedEpisodes).toEqual([1, 2, 3, 4, 5]);
      entry.watchedEpisodes.push(7);
      const out = encodeTitle(entry, 60);
      expect(out['Watched Episodes']).toBe('S01E01-E05, S01E07, S02E01');
      expect(out['Skipped Episodes']).toBe('S01E09');
      expect(splitCache(entry)).not.toHaveProperty('seasons');
    });

    it('waits while a season refill is pending', () => {
      const pending = { ...fm, 'External ID': 'tmdb:tv:1' };
      const { entry } = decodeTitle('TV Show/N', pending, undefined);
      expect(entry.watchedEpisodes).toEqual([]);
      expect(encodeTitle(entry, 0, true)).not.toHaveProperty('Watched Episodes');
    });

    it('uses the implicit season once the refill found nothing or lacks a key', () => {
      const pending = { ...fm, 'External ID': 'tmdb:tv:1' };
      for (const result of ['notfound', 'nokey'] as const) {
        const { entry } = decodeTitle('TV Show/N', pending, { apiCheck: { seasons: { at: '2026-01-01T00:00:00Z', result } } });
        expect(entry.watchedEpisodes).toEqual([1, 2, 3, 4, 5]);
      }
      const transient = decodeTitle('TV Show/N', pending, { apiCheck: { seasons: { at: '2026-01-01T00:00:00Z', result: 'transient' } } });
      expect(transient.entry.watchedEpisodes).toEqual([]);
    });

    it('keeps movies without watched', () => {
      const { entry } = decodeTitle('Movie/M', { Name: 'M', Type: 'Movie', 'Total Episodes': 1, Status: 'Completed' }, undefined);
      expect(encodeTitle(entry, 100)).not.toHaveProperty('Watched Episodes');
    });
  });
});
