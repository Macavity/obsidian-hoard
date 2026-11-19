// FakeApp + storage stores + DataManager wired like main.ts: root 'W', watch types Movie / TV Show.
import { createStores, newDataManager } from './common';
import type { PosterQueue, ReleaseDateTargets } from '../../src/modules/watchlist/services/DataManager';
import { NOT_FOUND } from '../../src/shared/api/lookup';
import type { ApiService } from '../../src/shared/api/ApiService';
import type { HoardTitle } from '../../src/modules/watchlist/contract';

// browser globals the manager touches
export async function setupDataManager(files: Record<string, string>, extra: Record<string, unknown> = {}) {
	// ids handed to the poster fetch queue
	const posterQueue: string[] = [];
	const { f, plugin, settings, local, layout, shared, index, base, notices } = await createStores(files, {
		types: ['Movie', 'TV Show'],
		pluginExtra: {
			posterService: {
				enqueue: (t: HoardTitle) => { posterQueue.push(t.id); return Promise.resolve(null); },
			},
			...extra,
		},
	});
	// the fake plugin bag is read lazily: tests attach apiService / readingDataManager / gameDataManager later
	const bag = plugin as unknown as {
		apiService?: Partial<Pick<ApiService, 'fetchAiring' | 'fetchSeasons'>>;
		posterService?: PosterQueue;
		readingDataManager: ReleaseDateTargets;
		gameDataManager: ReleaseDateTargets;
	};
	const build = () => newDataManager(
		base,
		// a test stubs only the calls it cares about; the others find nothing
		{
			fetchAiring: (e) => (bag.apiService?.fetchAiring ?? (() => Promise.resolve(NOT_FOUND)))(e),
			fetchSeasons: (t) => (bag.apiService?.fetchSeasons ?? (() => Promise.resolve(NOT_FOUND)))(t),
		},
		() => bag.posterService ?? null,
		{
			clearBookOrMangaReleaseDate: (kind, id) => bag.readingDataManager.clearBookOrMangaReleaseDate(kind, id),
			clearGameReleaseDate: (id) => bag.gameDataManager.clearGameReleaseDate(id),
		},
	);
	const dm = build();
	await dm.init();
	/** A second manager on the same stores, for restart scenarios. */
	return { dm, f, local, index, settings, posterQueue, plugin, shared, layout, notices, base, newDm: build };
}

export function makeTitle(over: Partial<HoardTitle>): HoardTitle {
	const now = new Date().toISOString();
	return {
		id: 'tmp',
		title: 'Untitled',
		type: 'Movie',
		status: 'Plan to watch',
		priority: 'Medium',
		review: '',
		rating: 0,
		notes: '',
		dateStarted: null,
		dateFinished: null,
		dateAdded: now,
		dateModified: now,
		totalEpisodes: 0,
		episodeDuration: 0,
		releaseDate: null,
		externalLink: '',
		seasons: [],
		watchedEpisodes: [],
		...over,
	};
}
