import { describe, it, expect } from 'vitest';
import { SOURCE_TYPES, apiGroupOf, isAnime, isMovie, mediaKindOf, parseSourceType } from '../src/shared/domain/sourceType';

describe('sourceType', () => {
	it('lists the three values', () => {
		expect(SOURCE_TYPES).toEqual(['Anime', 'Movie', 'Series']);
	});
	it('parses exact values only', () => {
		expect(parseSourceType('Anime')).toBe('Anime');
		expect(parseSourceType('anime')).toBeUndefined();
		expect(parseSourceType('Film')).toBeUndefined();
		expect(parseSourceType(3)).toBeUndefined();
	});
	it('maps to the api group', () => {
		expect(apiGroupOf({ sourceType: 'Anime' })).toBe('anime');
		expect(apiGroupOf({ sourceType: 'Movie' })).toBe('movie');
		expect(apiGroupOf({ sourceType: 'Series' })).toBe('movie');
		expect(apiGroupOf({})).toBe('');
	});
	it('maps to the media kind', () => {
		expect(mediaKindOf({ sourceType: 'Movie' })).toBe('movie');
		expect(mediaKindOf({ sourceType: 'Series' })).toBe('tv');
		expect(mediaKindOf({ sourceType: 'Anime' })).toBeNull();
		expect(mediaKindOf({})).toBeNull();
	});
	it('tells movies and anime', () => {
		expect(isMovie({ sourceType: 'Movie' })).toBe(true);
		expect(isMovie({})).toBe(false);
		expect(isAnime({ sourceType: 'Anime' })).toBe(true);
		expect(isAnime({ sourceType: 'Series' })).toBe(false);
	});
});
