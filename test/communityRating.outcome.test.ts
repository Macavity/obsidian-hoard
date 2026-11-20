import { describe, expect, it } from 'vitest';
import { animeLink, ratingRefreshNotice } from '../src/modules/watchlist/ui/CommunityRating';
import { apiErrorMessage } from '../src/shared/api/ApiService';
import { t } from '../src/shared/i18n';

describe('animeLink', () => {
	it('builds the AniList link', () => {
		expect(animeLink(true, 5)).toBe('https://anilist.co/anime/5');
	});
	it('builds the MyAnimeList link', () => {
		expect(animeLink(false, 7)).toBe('https://myanimelist.net/anime/7');
	});
});

describe('ratingRefreshNotice', () => {
	it('words every outcome like the refresh did before', () => {
		expect(ratingRefreshNotice({ kind: 'noApi' })).toBe(t('detail.community.noApi'));
		expect(ratingRefreshNotice({ kind: 'noApi' })).toContain('Source Type');
		expect(ratingRefreshNotice({ kind: 'noMatch', source: 'MAL' })).toBe(t('detail.community.noMatch', { source: 'MAL' }));
		expect(ratingRefreshNotice({ kind: 'fetchFailed' })).toBe(t('detail.community.fetchFailed'));
	});
	it('labels the source of an update', () => {
		expect(ratingRefreshNotice({ kind: 'updated', source: 'imdb' })).toBe(t('detail.community.updated', { source: 'IMDb' }));
		expect(ratingRefreshNotice({ kind: 'updated', source: 'other' })).toBe(t('detail.community.updated', { source: 'other' }));
	});
	it('shows the API error message', () => {
		const err = new Error('boom');
		expect(ratingRefreshNotice({ kind: 'error', err })).toBe(apiErrorMessage(err));
	});
	it('is silent when the title is gone', () => {
		expect(ratingRefreshNotice({ kind: 'gone' })).toBeNull();
	});
});
