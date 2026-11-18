import { AddTitleModal, type AddTitleModalDeps } from './AddTitleModal';
import { AddReadingModal, type AddReadingModalDeps } from './AddReadingModal';
import { AddGameModal, type AddGameModalDeps } from './AddGameModal';
import { DraftChoiceModal, type DraftChoiceModalDeps } from './DraftChoiceModal';

export interface AddRouterDeps extends DraftChoiceModalDeps, AddTitleModalDeps, AddGameModalDeps, AddReadingModalDeps {
	settings: AddTitleModalDeps['settings'];
	api: AddTitleModalDeps['api'] & AddGameModalDeps['api'] & AddReadingModalDeps['api'];
}

export interface AddRouteOptions {
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
export function openAddForTitle(deps: AddRouterDeps, opts: AddRouteOptions): void {
	const { title, onAdded, heading } = opts;
	const done = (): void => onAdded?.();

	new DraftChoiceModal(deps, title, (choice) => {
		if (choice === 'watchlist') {
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
			new AddGameModal(deps, done, {
				searchQuery: title,
				title,
			}).open();
		} else {
			new AddReadingModal(deps, choice, done, undefined, title).open();
		}
	}, heading).open();
}
