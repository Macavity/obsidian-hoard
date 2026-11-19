import { requestUrl } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../src/shared/api/ApiService';

const sent = vi.mocked(requestUrl);
const ok = (json: unknown) => ({ status: 200, text: JSON.stringify(json), json }) as never;
const status = (code: number) => ({ status: code, text: '', json: null }) as never;

beforeEach(() => { sent.mockReset(); });

describe('findTmdbMovieIdByImdbId', () => {
	it('is found with the first movie id', async () => {
		sent.mockResolvedValue(ok({ movie_results: [{ id: 348 }, { id: 9 }], tv_results: [] }));
		expect(await new ApiService('', 'k').findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'found', value: 348 });
	});

	it('is notfound for a series (empty movie_results)', async () => {
		sent.mockResolvedValue(ok({ movie_results: [], tv_results: [{ id: 1396 }] }));
		expect(await new ApiService('', 'k').findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'notfound' });
	});

	it('is failed when the request fails', async () => {
		sent.mockRejectedValue(new Error('offline'));
		expect(await new ApiService('', 'k').findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'failed' });
	});

	it('is nokey without a key or when the key is rejected', async () => {
		expect(await new ApiService('', '').findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'nokey' });
		sent.mockResolvedValue(status(401));
		expect(await new ApiService('', 'bad').findTmdbMovieIdByImdbId('tt1')).toEqual({ status: 'nokey' });
	});

	it('is notfound for an empty id and asks nothing', async () => {
		expect(await new ApiService('', 'k').findTmdbMovieIdByImdbId('')).toEqual({ status: 'notfound' });
		expect(sent).not.toHaveBeenCalled();
	});
});

describe('getTmdbMovieCollection', () => {
	it('is found with the collection ref', async () => {
		sent.mockResolvedValue(ok({ belongs_to_collection: { id: 99, name: 'Dune Collection', poster_path: '/p.jpg' } }));
		expect(await new ApiService('', 'k').getTmdbMovieCollection(1)).toEqual({
			status: 'found', value: { id: 99, name: 'Dune Collection', poster_path: '/p.jpg' },
		});
	});

	it('tolerates a ref without a name or poster', async () => {
		sent.mockResolvedValue(ok({ belongs_to_collection: { id: 99, name: 5, poster_path: null } }));
		expect(await new ApiService('', 'k').getTmdbMovieCollection(1)).toEqual({ status: 'found', value: { id: 99, name: '' } });
	});

	it('is notfound when the movie belongs to none', async () => {
		sent.mockResolvedValue(ok({ belongs_to_collection: null }));
		expect(await new ApiService('', 'k').getTmdbMovieCollection(1)).toEqual({ status: 'notfound' });
	});

	it('is failed on a request failure and nokey without a key', async () => {
		sent.mockRejectedValue(new Error('offline'));
		expect(await new ApiService('', 'k').getTmdbMovieCollection(1)).toEqual({ status: 'failed' });
		expect(await new ApiService('', '').getTmdbMovieCollection(1)).toEqual({ status: 'nokey' });
	});
});
