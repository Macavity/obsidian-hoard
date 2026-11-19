// FakeApp + storage stores + GameDataManager wired like main.ts (root 'W'); DataManager stubbed to the airtime bridge.
import { createStores, newGameManager } from './common';
import { newGame } from '../../src/modules/games/domain/newGame';
import type { Game } from '../../src/modules/games/domain/model';

export async function setupGames(files: Record<string, string>) {
	const airtime = { added: [] as string[], removed: [] as string[] };
	const { f, local, shared, index, base, notices } = await createStores(files, { loadShared: true });
	const gdm = newGameManager(base, {
		autoAddGameToUpcoming: (game: Game) => { airtime.added.push(game.id); return Promise.resolve(); },
		removeGameAirtimeEntries: (id: string) => { airtime.removed.push(id); return Promise.resolve(); },
	});
	await gdm.init();
	return { gdm, f, local, index, shared, airtime, notices };
}

/** A default game through the app's own factory, so the helper cannot drift from what a new game is. */
export function makeGame(over: Partial<Game>): Game {
	return newGame({ id: 'tmp', title: 'Untitled', type: '', status: 'Not started', ...over });
}
