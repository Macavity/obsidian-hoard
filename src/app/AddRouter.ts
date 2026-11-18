import type { App } from 'obsidian';
import type { SettingsReader, SettingsWriter } from '../shared/services/SettingsService';
import type { ReadingDataManager } from '../modules/reading/services/ReadingDataManager';
import type { GameDataManager } from '../modules/games/services/GameDataManager';
import type { searchBooks } from '../modules/covers/services/coverRefresh';
import { AddTitleModal, type AddTitleApi, type AddTitleStore } from '../modules/watchlist/ui/AddTitleModal';
import { AddReadingModal, type AddReadingApi } from '../modules/reading/ui/AddReadingModal';
import { AddGameModal, type AddGameApi } from '../modules/games/ui/AddGameModal';
import type { AddRouteOptions } from '../shared/ui/addRoute';
import { DraftChoiceModal } from '../modules/drafts/ui/DraftChoiceModal';

export interface AddRouterDeps {
	app: App;
	settings: SettingsReader & SettingsWriter;
	titles: AddTitleStore;
	reading: ReadingDataManager;
	games: GameDataManager;
	api: AddTitleApi & AddGameApi & AddReadingApi;
	resolveDefaultAddType: () => string;
	searchBooks: typeof searchBooks;
}

/**
 * Opens the Watchlist / Book / Manga / Game chooser for a loose title string, then the matching Add
 * modal with that title prefilled. Shared by the Drafts cards and the Custom Lists rows so the four
 * routes live in one place.
 */
export function openAddForTitle(deps: AddRouterDeps, opts: AddRouteOptions): void {
	const { title, onAdded, heading } = opts;
	const done = (): void => onAdded?.();

	new DraftChoiceModal(deps.app, {
		draftText: title,
		heading,
		onChoice: (choice) => {
			if (choice === 'watchlist') {
				new AddTitleModal(deps.app, deps.settings, deps.titles, deps.api, deps.resolveDefaultAddType, {
					onAdded: done,
					prefill: {
						searchQuery: title,
						title,
						type: 'Anime',
						episodes: 0,
						duration: 0,
						releaseDate: '',
						link: '',
						seasons: [],
					},
				}).open();
			} else if (choice === 'game') {
				new AddGameModal(deps.app, deps.settings, deps.games, deps.api, {
					onAdded: done,
					prefill: { searchQuery: title, title },
				}).open();
			} else {
				new AddReadingModal(
					deps.app,
					deps.settings,
					deps.reading,
					deps.app.vault,
					deps.app.workspace,
					deps.searchBooks,
					deps.api,
					{ mode: choice, onSaved: done, prefillSearch: title },
				).open();
			}
		},
	}).open();
}
