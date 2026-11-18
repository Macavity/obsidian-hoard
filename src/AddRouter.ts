import type HoardPlugin from './main';
import type { DataManager } from './DataManager';
import { AddTitleModal, type AddTitleModalDeps } from './AddTitleModal';
import { AddReadingModal, type AddReadingModalDeps } from './AddReadingModal';
import { AddGameModal, type AddGameModalDeps } from './AddGameModal';
import { DraftChoiceModal } from './DraftChoiceModal';

export interface AddRouteOptions {
	plugin: HoardPlugin;
	dataManager: DataManager;
	/** Prefills the search box and the title field of whichever Add modal is picked. */
	title: string;
	/** Fires once the title is actually saved into a library. */
	onAdded?: () => void;
	/** Chooser heading — "Add draft" from Drafts, "Add title" elsewhere. */
	heading?: string;
}

/**
 * Opens the Watchlist / Book / Manga / Game chooser for a loose title string, then the matching Add
 * modal with that title prefilled. Shared by the Drafts cards and the Custom Lists rows so the four
 * routes live in one place.
 */
export function openAddForTitle(opts: AddRouteOptions): void {
	const { plugin, dataManager, title, onAdded, heading } = opts;
	const done = (): void => onAdded?.();

	new DraftChoiceModal(plugin.app, title, (choice) => {
		if (choice === 'watchlist') {
			// TODO(Task 7): AddRouter takes AddTitleModalDeps instead of the plugin
			const deps: AddTitleModalDeps = {
				app: plugin.app,
				settings: plugin.settingsService,
				titles: dataManager,
				api: plugin.apiService,
				resolveDefaultAddType: () => plugin.resolveDefaultAddType(),
			};
			new AddTitleModal(deps, done, {
				searchQuery: title,
				title,
				type: 'Anime',
				episodes: 0,
				duration: 0,
				releaseDate: '',
				link: '',
				seasons: [],
			}).open();
		} else if (choice === 'game') {
			// TODO(Task 7): AddRouter takes AddGameModalDeps instead of the plugin
			const deps: AddGameModalDeps = {
				app: plugin.app,
				settings: plugin.settingsService,
				games: plugin.gameDataManager,
				api: plugin.apiService,
			};
			new AddGameModal(deps, done, {
				searchQuery: title,
				title,
			}).open();
		} else {
			// TODO(Task 7): AddRouter takes AddReadingModalDeps instead of the plugin
			const deps: AddReadingModalDeps = {
				app: plugin.app,
				settings: plugin.settingsService,
				reading: plugin.readingDataManager,
				api: plugin.apiService,
			};
			new AddReadingModal(
				deps,
				choice,
				done,
				undefined,
				title,
			).open();
		}
	}, heading).open();
}
