// FakeApp + storage stores + GameDataManager wired like main.ts (root 'W'); DataManager stubbed to the airtime bridge.
import { createStores } from './common';
import { GameDataManager } from '../../src/GameDataManager';
import { newGame } from '../../src/entryFactories';
import type { Game } from '../../src/types';

export async function setupGames(files: Record<string, string>) {
	const airtime = { added: [] as string[], removed: [] as string[] };
	const { f, plugin, local, shared, index, stores, notices } = await createStores(files, {
		loadShared: true,
		pluginExtra: {
			dataManager: {
				autoAddGameToUpcoming: (game: Game) => { airtime.added.push(game.id); return Promise.resolve(); },
				removeGameAirtimeEntries: (id: string) => { airtime.removed.push(id); return Promise.resolve(); },
			},
		},
	});
	const gdm = new GameDataManager(plugin, stores);
	await gdm.init();
	return { gdm, f, local, index, shared, airtime, notices };
}

/** A default game through the app's own factory, so the helper cannot drift from what a new game is. */
export function makeGame(over: Partial<Game>): Game {
	return newGame({ id: 'tmp', title: 'Untitled', type: '', status: 'Not started', ...over });
}
