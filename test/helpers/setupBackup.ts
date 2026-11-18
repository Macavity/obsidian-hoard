// All managers + HistoryManager (memory-only) sharing one FakeApp, wired like main.ts (root 'W').
import { parse, stringify } from 'yaml';
import { createStores } from './common';
import { DataManager } from '../../src/DataManager';
import { ReadingDataManager } from '../../src/ReadingDataManager';
import { GameDataManager } from '../../src/GameDataManager';
import { HistoryManager } from '../../src/HistoryManager';
import { NO_KEY } from '../../src/lookup';
import { HistoryStore } from '../../src/storage/HistoryStore';

export async function setupBackup(files: Record<string, string>, secrets: Record<string, string> = {}) {
	const { f, plugin, local, layout, shared, base } = await createStores(files, {
		types: ['Movie', 'TV Show'],
		loadShared: true,
		secrets,
		pluginExtra: { posterService: { enqueue: () => Promise.resolve(null) } },
	});
	// ports are lambdas, like in main.ts: construction order does not matter
	const dataManager: DataManager = new DataManager({
		...base,
		api: { fetchAiring: () => Promise.resolve(NO_KEY), fetchSeasons: () => Promise.resolve(NO_KEY) },
		posters: () => ({ enqueue: () => Promise.resolve(null) }),
		registerEvent: f.plugin.registerEvent,
		releaseDates: {
			clearBookOrMangaReleaseDate: (kind, id) => readingDataManager.clearBookOrMangaReleaseDate(kind, id),
			clearGameReleaseDate: (id) => gameDataManager.clearGameReleaseDate(id),
		},
	});
	const readingDataManager: ReadingDataManager = new ReadingDataManager({
		...base,
		upcoming: {
			autoAddReadingToUpcoming: (i, k) => dataManager.autoAddReadingToUpcoming(i, k),
			removeReadingAirtimeEntries: (id) => dataManager.removeReadingAirtimeEntries(id),
		},
	});
	const gameDataManager: GameDataManager = new GameDataManager({
		...base,
		upcoming: {
			autoAddGameToUpcoming: (g) => dataManager.autoAddGameToUpcoming(g),
			removeGameAirtimeEntries: (id) => dataManager.removeGameAirtimeEntries(id),
		},
	});
	const historyManager = new HistoryManager(null);
	const p = plugin as unknown as Record<string, unknown>;
	p.dataManager = dataManager;
	p.readingDataManager = readingDataManager;
	p.gameDataManager = gameDataManager;
	p.historyManager = historyManager;
	await dataManager.init();
	await readingDataManager.init();
	await gameDataManager.init();
	const storage = {
		local,
		shared,
		importContext: () => ({
			app: f.app, local, shared, layout, yaml: { parse, stringify },
			history: new HistoryStore(f.app, () => layout),
		}),
	};
	/** What was last written to data.json. */
	const savedData = () => f.plugin.data;
	return { f, local, secrets: f.secrets, savedData, shared, dataManager, readingDataManager, gameDataManager, historyManager, storage };
}
