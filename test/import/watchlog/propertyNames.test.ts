import { describe, expect, it } from 'vitest';
import { OLD_TO_NEW, translateProperties } from '../../../src/import/watchlog/propertyNames';
import { ALL_PROPERTY_NAMES } from '../../../src/storage/properties';
import { formatExternalId } from '../../../src/storage/externalId';

/** Every frontmatter key Hoard 0.1 / WatchLog Sync could write or read (frozen copy of the 0.1 key lists). */
const KEYS_0_1 = [
	'title', 'type', 'status', 'priority', 'review', 'rating', 'progress', 'totalEpisodes', 'episodeDuration',
	'dateStarted', 'dateFinished', 'dateAdded', 'dateModified', 'releaseDate', 'malId', 'anilistId',
	'communityRating', 'communityVotes', 'communitySource', 'director', 'cast', 'studio', 'poster', 'trailer',
	'externalLink', 'pinned', 'favorite', 'dateFavorited', 'externalId', 'groups', 'maybe', 'watched', 'skipped',
	'seasons', 'manualPosterUrl', 'manualTrailerUrl', 'manualDirector', 'manualCast', 'manualStudio',
	'airtimeRecurrence', 'airtimeDay', 'airtimeTime', 'airtimeSeason', 'airtimeEpisode', 'airtimeAcknowledged',
	'author', 'coverUrl', 'pagesRead', 'totalPages', 'progressUnit', 'wordsRead', 'totalWords', 'chaptersRead',
	'totalChapters', 'googleBooksId', 'volumesRead', 'totalVolumes',
	'developer', 'publisher', 'genre', 'wishlist', 'playtime', 'achievements', 'platforms', 'singleplayer', 'coop',
	'multiplayer', 'steamAppId', 'storeUrl', 'lastPlayed',
];

describe('translateProperties', () => {
	it('maps every 0.1 key to a current property name', () => {
		for (const key of KEYS_0_1) expect(ALL_PROPERTY_NAMES).toContain(OLD_TO_NEW[key]);
	});
	it('renames keys and keeps unknown ones in place', () => {
		const { fm, kept } = translateProperties({ title: 'Heat', dateAdded: '2024-01-01', externalLink: 'https://x', mine: 1 });
		expect(fm).toEqual({ Name: 'Heat', 'Date Added': '2024-01-01', URL: 'https://x', mine: 1 });
		expect(Object.keys(fm)).toEqual(['Name', 'Date Added', 'URL', 'mine']);
		expect(kept).toEqual([]);
	});
	it('aligns value types', () => {
		expect(translateProperties({ progress: '50%' }).fm).toEqual({ Progress: 50 });
		expect(translateProperties({ progress: 40 }).fm).toEqual({ Progress: 40 });
		expect(translateProperties({ malId: '21' }).fm).toEqual({ 'MAL ID': 21 });
	});
	it('folds older names into the current ones', () => {
		expect(translateProperties({ manualPosterUrl: 'https://p' }).fm).toEqual({ Cover: 'https://p' });
		expect(translateProperties({ apiSource: 'rawg', apiId: '12' }).fm)
			.toEqual({ 'External ID': formatExternalId({ source: 'rawg', id: '12' }) });
		expect(translateProperties({ externalId: 'tmdb:movie:1', apiSource: 'rawg', apiId: '12' }).fm)
			.toEqual({ 'External ID': 'tmdb:movie:1', apiSource: 'rawg', apiId: '12' });
	});
	it('keeps the old key when the new one already exists', () => {
		const { fm, kept } = translateProperties({ title: 'a', Name: 'b', poster: 'p', coverUrl: 'c' });
		expect(fm).toEqual({ title: 'a', Name: 'b', Cover: 'p', coverUrl: 'c' });
		expect(kept).toEqual(['title', 'coverUrl']);
	});
	it('leaves keys named like Object.prototype members alone', () => {
		const { fm, kept } = translateProperties({ constructor: 'a', toString: 'b', valueOf: 1, title: 'T' });
		expect(fm).toEqual({ constructor: 'a', toString: 'b', valueOf: 1, Name: 'T' });
		expect(Object.keys(fm)).toEqual(['constructor', 'toString', 'valueOf', 'Name']);
		expect(kept).toEqual([]);
	});
	it('carries a __proto__ key over as an own data property', () => {
		const { fm } = translateProperties(JSON.parse('{"__proto__":"x","title":"T"}') as Record<string, unknown>);
		expect(Object.keys(fm)).toEqual(['__proto__', 'Name']);
		expect(Object.getPrototypeOf(fm)).toBe(Object.prototype);
	});
	it('is idempotent', () => {
		const once = translateProperties({ title: 'Heat', progress: '10%', watched: 'S01E01' }).fm;
		expect(translateProperties(once)).toEqual({ fm: once, kept: [] });
	});
});
