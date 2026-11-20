import { describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { PosterService } from '../src/shared/api/PosterService';
import type { HoardTitle } from '../src/modules/watchlist/domain/model';
import { DEFAULT_SETTINGS } from '../src/modules/settings/domain/settingsDefaults';
import { ApiService } from '../src/shared/api/ApiService';

function setup(api: Partial<ApiService>, keys: { tmdbApiKey?: string; omdbApiKey?: string } = {}) {
	const updatePosterUrl = vi.fn().mockResolvedValue(undefined);
	const recordLookup = vi.fn();
	const svc = new PosterService(
		{ updatePosterUrl, recordLookup, lookupDue: () => true },
		() => ({ ...DEFAULT_SETTINGS, tmdbApiKey: '', omdbApiKey: '', ...keys, typeApiMapping: { Doc: 'movie' } }),
		() => api as ApiService,
	);
	return { svc, updatePosterUrl, recordLookup };
}
const title = (extra: Partial<HoardTitle>) =>
	({ id: 'Movie/A', title: 'Breaking Bad', type: 'TV Show', sourceType: 'Series', ...extra }) as HoardTitle;

describe('PosterService keyless (Cinemeta)', () => {
	const noMatch = { json: { Response: 'False' }, text: '{}', status: 200 } as never;

	it('continues to cinemeta after a clean keyed miss', async () => {
		vi.mocked(requestUrl).mockResolvedValue(noMatch);
		const getCinemetaDetails = vi.fn().mockResolvedValue({ posterUrl: 'https://img/bb.jpg' });
		const { svc } = setup({ getCinemetaDetails }, { omdbApiKey: 'k' });
		const url = await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(url).toBe('https://img/bb.jpg');
	});

	it('records a transient failure when a keyed request fails and cinemeta has nothing', async () => {
		vi.mocked(requestUrl).mockRejectedValue(new Error('net'));
		const { svc, updatePosterUrl, recordLookup } = setup({ searchCinemeta: vi.fn().mockResolvedValue([]) }, { tmdbApiKey: 't' });
		expect(await svc.enqueue(title({}))).toBeNull();
		expect(updatePosterUrl).not.toHaveBeenCalled();
		expect(recordLookup).toHaveBeenCalledWith('Movie/A', 'poster', { status: 'failed' });
	});

	it('uses getCinemetaDetails with the IMDb id from the external link', async () => {
		const getCinemetaDetails = vi.fn().mockResolvedValue({ posterUrl: 'https://img/bb.jpg' });
		const { svc } = setup({ getCinemetaDetails });
		const url = await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(url).toBe('https://img/bb.jpg');
		expect(getCinemetaDetails).toHaveBeenCalledWith('tt0903747', 'tv');
	});

	it('searches by title (matching year) without a link', async () => {
		const searchCinemeta = vi.fn().mockResolvedValue([
			{ posterUrl: 'https://img/old.jpg', releaseDate: '1999-01-01' },
			{ posterUrl: 'https://img/new.jpg', releaseDate: '2008-01-20' },
		]);
		const { svc } = setup({ searchCinemeta });
		const url = await svc.enqueue(title({ releaseDate: '2008-01-20' }));
		expect(url).toBe('https://img/new.jpg');
		expect(searchCinemeta).toHaveBeenCalledWith('Breaking Bad', 'series', '2008');
	});

	it('records a network failure as transient', async () => {
		const { svc, updatePosterUrl, recordLookup } = setup({ searchCinemeta: vi.fn().mockRejectedValue(new Error('net')) });
		expect(await svc.enqueue(title({}))).toBeNull();
		expect(updatePosterUrl).not.toHaveBeenCalled();
		expect(recordLookup).toHaveBeenCalledWith('Movie/A', 'poster', { status: 'failed' });
	});

	it('falls through to a search when the IMDb hit has no poster', async () => {
		const getCinemetaDetails = vi.fn().mockResolvedValue({ posterUrl: '' });
		const searchCinemeta = vi.fn().mockResolvedValue([{ posterUrl: 'https://img/s.jpg', releaseDate: '' }]);
		const { svc } = setup({ getCinemetaDetails, searchCinemeta });
		const url = await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(url).toBe('https://img/s.jpg');
	});

	it('searches movies for a movie without year', async () => {
		const searchCinemeta = vi.fn().mockResolvedValue([]);
		const { svc } = setup({ searchCinemeta });
		await svc.enqueue(title({ type: 'Movie', sourceType: 'Movie' }));
		expect(searchCinemeta).toHaveBeenCalledWith('Breaking Bad', 'movie', undefined);
	});
});

describe('PosterService not-due titles', () => {
  it('sends no request and records nothing for a title that is not due', async () => {
    vi.mocked(requestUrl).mockClear();
    const searchCinemeta = vi.fn().mockResolvedValue([]);
    const recordLookup = vi.fn();
    const svc = new PosterService(
      { updatePosterUrl: vi.fn(), recordLookup, lookupDue: () => false },
      () => ({ ...DEFAULT_SETTINGS, tmdbApiKey: '', omdbApiKey: '', typeApiMapping: {} }),
      () => ({ searchCinemeta }) as unknown as ApiService,
    );
    expect(await svc.enqueue(title({}))).toBeNull();
    expect(recordLookup).not.toHaveBeenCalled();
    expect(searchCinemeta).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });

  it('records nothing for a type without a poster source', async () => {
    const { svc, recordLookup } = setup({}, {});
    expect(await svc.enqueue(title({ type: 'Unmapped', sourceType: undefined }))).toBeNull();
    expect(recordLookup).not.toHaveBeenCalled();
  });
});
