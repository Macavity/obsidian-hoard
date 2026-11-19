import { describe, expect, it } from 'vitest';
import { parseApiGroup, typeApiRoute } from '../src/modules/settings/domain/apiRouting';

describe('typeApiRoute', () => {
	it('locks Anime to Jikan / AniList', () => {
		expect(typeApiRoute('Anime')).toEqual({ kind: 'locked', apis: 'Jikan / AniList' });
	});

	it.each(['Movie', 'TV Show', 'TvShow'])('locks %s to OMDb / TMDB', (name) => {
		expect(typeApiRoute(name)).toEqual({ kind: 'locked', apis: 'OMDb / TMDB' });
	});

	it('lets other types choose', () => {
		expect(typeApiRoute('Documentary')).toEqual({ kind: 'select' });
	});
});

describe('parseApiGroup', () => {
	it('accepts the known groups', () => {
		expect(parseApiGroup('movie')).toBe('movie');
		expect(parseApiGroup('anime')).toBe('anime');
		expect(parseApiGroup('')).toBe('');
	});

	it('falls back to empty for unknown values', () => {
		expect(parseApiGroup('x')).toBe('');
	});
});
