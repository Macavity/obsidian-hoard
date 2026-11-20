import { beforeEach, describe, expect, it } from 'vitest';
import { ApiService } from '../src/shared/api/ApiService';
import { answerAll, route, sent, urlOfCall } from './helpers/apiFailures';

beforeEach(() => { sent.mockReset(); });

const JIKAN_ANIME = {
	data: {
		mal_id: 52991, title: 'Sousou no Frieren', title_english: 'Frieren: Beyond Journey\'s End', episodes: 28,
		duration: '24 min per ep', aired: { from: '2023-09-29T00:00:00+00:00' }, url: 'https://myanimelist.net/anime/52991',
		images: { jpg: { large_image_url: 'https://cdn.example/f.jpg' } },
	},
};

describe('getAnimeByMalId', () => {
	it('maps the Jikan record like a search row', async () => {
		route([['/anime/52991', JIKAN_ANIME]]);
		const svc = new ApiService('');
		const hit = await svc.getAnimeByMalId(52991);
		expect(hit).toMatchObject({
			malId: 52991, title: 'Frieren: Beyond Journey\'s End', episodes: 28, duration: 24, releaseDate: '2023-09-29',
			url: 'https://myanimelist.net/anime/52991', posterUrl: 'https://cdn.example/f.jpg',
			seasons: [{ name: 'Season 1', episodes: 28, offset: 0 }],
		});
		expect(urlOfCall(sent.mock.calls[0]![0])).toMatch(/\/anime\/52991$/);
	});

	it('404 yields null', async () => {
		answerAll(404, '');
		expect(await new ApiService('').getAnimeByMalId(1)).toBeNull();
	});
});

describe('getAniListAnimeById', () => {
	it('maps the AniList media like a search row', async () => {
		route([['graphql.anilist.co', {
			data: { Media: {
				id: 154587, title: { romaji: 'Sousou no Frieren', english: 'Frieren' }, episodes: 28, duration: 24,
				startDate: { year: 2023, month: 9, day: 29 }, coverImage: { large: 'https://cdn.example/a.jpg' },
			} },
		}]]);
		const hit = await new ApiService('').getAniListAnimeById(154587);
		expect(hit).toMatchObject({
			anilistId: 154587, title: 'Frieren', episodes: 28, duration: 24, releaseDate: '2023-09-29',
			url: 'https://anilist.co/anime/154587', posterUrl: 'https://cdn.example/a.jpg',
		});
	});

	it('yields null when AniList has no such media', async () => {
		route([['graphql.anilist.co', { data: { Media: null } }]]);
		expect(await new ApiService('').getAniListAnimeById(1)).toBeNull();
	});
});

describe('getAniListMangaMalId', () => {
	it('reads the MAL id of an AniList manga', async () => {
		route([['graphql.anilist.co', { data: { Media: { idMal: 2 } } }]]);
		expect(await new ApiService('').getAniListMangaMalId(30002)).toBe(2);
		expect(JSON.stringify(sent.mock.calls[0]![0])).toContain('MANGA');
	});

	it('yields null when AniList has no MAL id or no media', async () => {
		route([['graphql.anilist.co', { data: { Media: { idMal: null } } }]]);
		expect(await new ApiService('').getAniListMangaMalId(1)).toBeNull();
		route([['graphql.anilist.co', { data: { Media: null } }]]);
		expect(await new ApiService('').getAniListMangaMalId(2)).toBeNull();
	});
});
