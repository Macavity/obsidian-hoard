import { describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { PosterService } from '../src/shared/api/PosterService';
import { DEFAULT_SETTINGS, type HoardTitle } from '../src/shared/domain/types';
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
	({ id: 'Movie/A', title: 'Breaking Bad', type: 'TV Show', ...extra }) as HoardTitle;

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

	it('prefers the series record over a foreign movie record when the kind is unknown', async () => {
		const getCinemetaDetails = vi.fn((_id: string, kind: string) =>
			Promise.resolve({ posterUrl: kind === 'movie' ? 'https://img/foreign.jpg' : 'https://img/series.jpg' }));
		const { svc } = setup({ getCinemetaDetails: getCinemetaDetails as never });
		const url = await svc.enqueue(title({ type: 'Doc', externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(url).toBe('https://img/series.jpg');
		expect(getCinemetaDetails.mock.calls[0]).toEqual(['tt0903747', 'tv']);
	});

	it('tries series then movie for a custom type with one episode', async () => {
		const getCinemetaDetails = vi.fn().mockResolvedValue(null);
		const { svc } = setup({ getCinemetaDetails, searchCinemeta: vi.fn().mockResolvedValue([]) });
		await svc.enqueue(title({ type: 'Doc', totalEpisodes: 1, externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(getCinemetaDetails.mock.calls.map((c: unknown[]) => c[1] as string)).toEqual(['tv', 'movie']);
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

	it('tries the movie record when the series record answers 404', async () => {
		vi.mocked(requestUrl).mockImplementation(((p: unknown) => {
			const url = (p as { url: string }).url;
			if (url.includes('/meta/series/')) return Promise.resolve({ status: 404, text: '', json: null } as never);
			const json = { meta: { id: 'tt1234567', name: 'M', year: '2020', poster: 'https://img/movie.jpg' } };
			return Promise.resolve({ status: 200, text: JSON.stringify(json), json } as never);
		}) as never);
		const { svc } = setup(new ApiService(''));
		const url = await svc.enqueue(title({ type: 'Doc', externalLink: 'https://www.imdb.com/title/tt1234567/' }));
		expect(url).toBe('https://img/movie.jpg');
	});

	it('falls through to a search when the IMDb hit has no poster', async () => {
		const getCinemetaDetails = vi.fn().mockResolvedValue({ posterUrl: '' });
		const searchCinemeta = vi.fn().mockResolvedValue([{ posterUrl: 'https://img/s.jpg', releaseDate: '' }]);
		const { svc } = setup({ getCinemetaDetails, searchCinemeta });
		const url = await svc.enqueue(title({ externalLink: 'https://www.imdb.com/title/tt0903747/' }));
		expect(url).toBe('https://img/s.jpg');
	});

	it('tries series then movie when the kind is unknown', async () => {
		const searchCinemeta = vi.fn()
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ posterUrl: 'https://img/x.jpg', releaseDate: '' }]);
		const { svc } = setup({ searchCinemeta });
		const url = await svc.enqueue(title({ type: 'Doc' }));
		expect(url).toBe('https://img/x.jpg');
		expect(searchCinemeta.mock.calls.map((c: unknown[]) => c[1] as string)).toEqual(['series', 'movie']);
	});

	it('searches movies for a movie without year', async () => {
		const searchCinemeta = vi.fn().mockResolvedValue([]);
		const { svc } = setup({ searchCinemeta });
		await svc.enqueue(title({ type: 'Movie' }));
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
    expect(await svc.enqueue(title({ type: 'Unmapped' }))).toBeNull();
    expect(recordLookup).not.toHaveBeenCalled();
  });
});
