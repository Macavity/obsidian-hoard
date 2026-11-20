import type { OpenAddWizard } from '../modules/add/exports';
import type { OpenAddGame } from '../modules/games/ui/AddGameModal';
import type { OpenDraftChoice } from '../modules/drafts/ui/DraftChoiceModal';
import type { OpenAddRoute } from '../shared/services/addRoute';

/**
 * Builds the Watchlist / Book / Manga / Game chooser for a loose title string, then the matching Add
 * modal with that title prefilled. Shared by the Drafts cards and the Custom Lists rows so the four
 * routes live in one place.
 */
export function createAddRoute(
	openDraftChoice: OpenDraftChoice,
	openAddWizard: OpenAddWizard,
	openAddGame: OpenAddGame,
): OpenAddRoute {
	return (opts) => {
		const { title, onAdded, heading } = opts;
		const done = (): void => onAdded?.();

		openDraftChoice({
			draftText: title,
			heading,
			onChoice: (choice) => {
				if (choice === 'watchlist') {
					openAddWizard({ query: title, preferredKinds: ['anime', 'series', 'movie'], onAdded: done });
				} else if (choice === 'game') {
					openAddGame({ onAdded: done, prefill: { searchQuery: title, title } });
				} else {
					openAddWizard({ query: title, preferredKinds: [choice], onAdded: done });
				}
			},
		});
	};
}
