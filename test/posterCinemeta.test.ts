import { describe, expect, it, vi } from 'vitest';
import { PosterService } from '../src/PosterService';
import { DEFAULT_SETTINGS, type HoardTitle } from '../src/types';
import type { ApiService } from '../src/ApiService';
import type { DataManager } from '../src/DataManager';

function setup(api: Partial<ApiService>) {
	const updatePosterUrl = vi.fn().mockResolvedValue(undefined);
	const svc = new PosterService(
		{ updatePosterUrl } as unknown as DataManager,
		() => ({ ...DEFAULT_SETTINGS, tmdbApiKey: '', omdbApiKey: '' }),
		() => api as ApiService,
	);
	return { svc, updatePosterUrl };
}
const title = (extra: Partial<HoardTitle>) =>
	({ id: 'Movie/A', title: 'Breaking Bad', type: 'TV Show', ...extra }) as HoardTitle;

describe('PosterService keyless (Cinemeta)', () => {
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

	it('does not cache a network failure as none', async () => {
		const { svc, updatePosterUrl } = setup({ searchCinemeta: vi.fn().mockRejectedValue(new Error('net')) });
		expect(await svc.enqueue(title({}))).toBeNull();
		expect(updatePosterUrl).not.toHaveBeenCalled();
	});
});
