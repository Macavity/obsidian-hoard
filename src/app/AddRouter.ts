import type { OpenAddTitle } from '../modules/watchlist/ui/AddTitleModal';
import type { OpenAddReading } from '../modules/reading/ui/AddReadingModal';
import type { OpenAddGame } from '../modules/games/ui/AddGameModal';
import type { OpenDraftChoice } from '../modules/drafts/ui/DraftChoiceModal';
import type { OpenAddRoute } from '../shared/ui/addRoute';

/**
 * Builds the Watchlist / Book / Manga / Game chooser for a loose title string, then the matching Add
 * modal with that title prefilled. Shared by the Drafts cards and the Custom Lists rows so the four
 * routes live in one place.
 */
export function createAddRoute(
	openDraftChoice: OpenDraftChoice,
	openAddTitle: OpenAddTitle,
	openAddReading: OpenAddReading,
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
					openAddTitle({
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
					});
				} else if (choice === 'game') {
					openAddGame({ onAdded: done, prefill: { searchQuery: title, title } });
				} else {
					openAddReading({ mode: choice, onSaved: done, prefillSearch: title });
				}
			},
		});
	};
}
