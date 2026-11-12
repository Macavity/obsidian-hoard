import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionModal } from '../src/CollectionModal';
import type { HoardTitle, MediaSearchResult, TmdbCollectionDetail } from '../src/types';

const NOW = '2026-03-04T05:06:07.000Z';

const collection: TmdbCollectionDetail = {
	id: 99,
	name: 'Dune Collection',
	parts: [
		{ id: 1, title: 'Dune', release_date: '2021-10-22' },
		{ id: 2, title: 'Dune: Part Two', release_date: '2024-03-01' },
	],
};

const detail = (over: Partial<MediaSearchResult>): MediaSearchResult => ({
	imdbId: '', title: 'Dune', mediaType: 'movie', episodes: 1, episodeDuration: 155, releaseDate: '2021-10-22',
	url: 'https://tmdb.test/movie/1', seasons: [], ...over,
});

interface Opts {
	details: Record<string, MediaSearchResult | null>;
	statuses?: { name: string }[];
	priorities?: { name: string }[];
	existing?: { id: string }[];
}

function setup(opts: Opts) {
	const batches: HoardTitle[][] = [];
	const dataManager = {
		getTitles: () => opts.existing ?? [],
		generateId: (title: string) => `Movie/${title}`,
		addTitleBatch: (entries: HoardTitle[]) => { batches.push(structuredClone(entries)); return Promise.resolve(); },
		notifyChange: () => {},
	};
	const plugin = {
		dataManager,
		settings: {
			statuses: opts.statuses ?? [{ name: 'Watching' }, { name: 'Plan to watch' }],
			priorities: opts.priorities ?? [{ name: 'High' }, { name: 'Medium' }],
		},
		apiService: { getTmdbMovieDetails: (id: string) => Promise.resolve(opts.details[id] ?? null) },
	};
	const modal = new CollectionModal({} as never, plugin as never, collection, 'Movie', () => {});
	const internals = modal as unknown as { selected: Set<number>; addSelected: () => Promise<void> };
	return {
		batches,
		add: async (ids: number[]): Promise<void> => {
			internals.selected = new Set(ids);
			await internals.addSelected();
		},
	};
}

beforeEach(() => {
	// without fake timers this mocks Date only
	vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('CollectionModal add selected', () => {
	it('builds the complete title for each picked part', async () => {
		const { batches, add } = setup({
			details: {
				'1': detail({ director: ['Denis Villeneuve'], cast: ['Timothée Chalamet'], trailerUrl: 'https://yt.test/dune' }),
				'2': detail({ title: 'Dune: Part Two', releaseDate: '', url: 'https://tmdb.test/movie/2', director: [], episodeDuration: 166 }),
			},
		});
		await add([1, 2]);
		expect(batches).toStrictEqual([[
			{
				id: 'Movie/Dune', title: 'Dune', type: 'Movie', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0, notes: '',
				dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 1, episodeDuration: 155,
				releaseDate: '2021-10-22', externalLink: 'https://tmdb.test/movie/1', seasons: [], watchedEpisodes: [],
				favorite: false, posterUrl: '', trailerUrl: 'https://yt.test/dune', manualTrailerUrl: '',
				tmdbId: 1, collectionId: 99, director: ['Denis Villeneuve'], cast: ['Timothée Chalamet'],
			},
			{
				id: 'Movie/Dune: Part Two', title: 'Dune: Part Two', type: 'Movie', status: 'Plan to watch', priority: 'Medium', review: '',
				rating: 0, notes: '', dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 1,
				episodeDuration: 166, releaseDate: null, externalLink: 'https://tmdb.test/movie/2', seasons: [], watchedEpisodes: [],
				favorite: false, posterUrl: '', trailerUrl: '', manualTrailerUrl: '', tmdbId: 2, collectionId: 99,
			},
		]]);
	});

	it('numbers a title whose id is taken in the library or earlier in the batch', async () => {
		const { batches, add } = setup({
			details: { '1': detail({}), '2': detail({}) },
			existing: [{ id: 'Movie/Dune' }],
		});
		await add([1, 2]);
		expect(batches[0]!.map((t) => t.id)).toEqual(['Movie/Dune-2', 'Movie/Dune-3']);
	});

	it('falls back to the first configured status and priority', async () => {
		const { batches, add } = setup({
			details: { '1': detail({}) },
			statuses: [{ name: 'Backlog' }],
			priorities: [{ name: 'Someday' }],
		});
		await add([1]);
		expect(batches[0]![0]).toMatchObject({ status: 'Backlog', priority: 'Someday' });
	});

	it('skips a part whose details cannot be fetched', async () => {
		const { batches, add } = setup({ details: { '1': null, '2': detail({ title: 'Dune: Part Two' }) } });
		await add([1, 2]);
		expect(batches[0]!.map((t) => t.title)).toEqual(['Dune: Part Two']);
	});
});
