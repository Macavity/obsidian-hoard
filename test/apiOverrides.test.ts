import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { decodeTitle, encodeTitle } from '../src/storage/titleCodec';
import { getCommunityRating, getDisplayTrailer, getTitleCredits } from '../src/types';
import { setupDataManager, makeTitle } from './helpers/setupDataManager';

const fmOf = (src: string | undefined): Record<string, unknown> =>
	parse(/^---\n([\s\S]*?)\n?---/.exec(src ?? '')?.[1] ?? '') as Record<string, unknown>;

const API_KEYS = ['Director', 'Cast', 'Studio', 'Trailer', 'Community Rating', 'Community Votes', 'Community Source'];

describe('API values live in the cache, note values override (E9)', () => {
	it('title codec: cache values are never encoded', () => {
		const { entry } = decodeTitle('Movie/A', { Name: 'A', Type: 'Movie' }, {
			director: ['D'], cast: ['C'], studio: ['S'], trailerUrl: 'https://t',
			communityRating: 7, communityVotes: 10, communitySource: 'tmdb',
		});
		expect(getTitleCredits(entry, 'director')).toEqual(['D']);
		const out = encodeTitle(entry, 0);
		for (const k of API_KEYS) expect(out, k).not.toHaveProperty(k);
	});

	it('title codec: note fields are overrides that win and round-trip', () => {
		const fm = {
			Name: 'A', Type: 'Movie', Director: ['Mine'], Cast: ['X', 'Y'], Studio: 'Studio',
			Trailer: 'https://mytrailer', 'Community Rating': 9, 'Community Votes': 1, 'Community Source': 'imdb',
		};
		const { entry, invalidFields } = decodeTitle('Movie/A', fm, {
			director: ['D'], trailerUrl: 'https://t', communityRating: 7, communityVotes: 10, communitySource: 'tmdb',
		});
		expect(invalidFields).toEqual([]);
		expect(getTitleCredits(entry, 'director')).toEqual(['Mine']);
		expect(getTitleCredits(entry, 'studio')).toEqual(['Studio']);
		expect(getDisplayTrailer(entry)).toBe('https://mytrailer');
		expect(getCommunityRating(entry)).toEqual({ rating: 9, votes: 1, source: 'imdb' });
		// the API values stay where they were
		expect(entry.director).toEqual(['D']);
		const out = encodeTitle(entry, 0);
		expect(out).toMatchObject({ Director: ['Mine'], Cast: ['X', 'Y'], Studio: ['Studio'], Trailer: 'https://mytrailer', 'Community Rating': 9, 'Community Votes': 1, 'Community Source': 'imdb' });
	});

	it('credits backfill writes only the cache', async () => {
		const note = '---\nName: A\nType: Movie\nURL: https://www.imdb.com/title/tt1\n---\n';
		const { dm, f, local } = await setupDataManager({ 'W/Movie/A.md': note });
		await dm.updateCredits('Movie/A', ['Dir'], ['Act']);
		await dm.updateStudio('Movie/A', ['Std']);
		expect(f.files.get('W/Movie/A.md')).toBe(note);
		expect(local.getCache('Movie/A')).toMatchObject({ director: ['Dir'], cast: ['Act'], studio: ['Std'] });
		expect(getTitleCredits(dm.getTitle('Movie/A')!, 'director')).toEqual(['Dir']);
	});

	it('a note override wins over the cache and survives edits', async () => {
		const { dm, f, local } = await setupDataManager({ 'W/Movie/A.md': '---\nName: A\nType: Movie\nDirector: [Mine]\n---\n' });
		await dm.updateCredits('Movie/A', ['Dir'], ['Act']);
		expect(getTitleCredits(dm.getTitle('Movie/A')!, 'director')).toEqual(['Mine']);
		expect(local.getCache('Movie/A')?.director).toEqual(['Dir']);
		const t = dm.getTitle('Movie/A')!;
		t.rating = 3;
		await dm.updateTitle(t);
		const fm = fmOf(f.files.get('W/Movie/A.md'));
		expect(fm.Director).toEqual(['Mine']);
		expect(fm).not.toHaveProperty('Cast');
	});

	it('adding a title keeps fetched values out of the note', async () => {
		const { dm, f, local } = await setupDataManager({});
		await dm.addTitle(makeTitle({ title: 'A', type: 'Movie', director: ['Dir'], trailerUrl: 'https://t', communityRating: 7, communitySource: 'tmdb' }));
		const fm = fmOf(f.files.get('W/Movie/A.md'));
		for (const k of API_KEYS) expect(fm, k).not.toHaveProperty(k);
		expect(local.getCache('Movie/A')).toMatchObject({ director: ['Dir'] });
	});
});
