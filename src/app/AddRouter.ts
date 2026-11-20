import type { OpenAddWizard } from '../modules/add/exports';
import type { OpenDraftChoice } from '../modules/drafts/ui/DraftChoiceModal';
import type { OpenAddRoute } from '../shared/services/addRoute';

/**
 * Builds the Watchlist / Book / Manga / Game chooser for a loose title string, then the add wizard on the
 * matching kinds with that title as its query. Shared by the Drafts cards and the Custom Lists rows so the four
 * routes live in one place.
 */
export function createAddRoute(
	openDraftChoice: OpenDraftChoice,
	openAddWizard: OpenAddWizard,
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
				} else {
					openAddWizard({ query: title, preferredKinds: [choice], onAdded: done });
				}
			},
		});
	};
}
