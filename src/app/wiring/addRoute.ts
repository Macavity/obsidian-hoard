import type { App } from 'obsidian';
import type { OpenAddRoute } from '../../shared/services/addRoute';
import type { OpenAddTitle } from '../../modules/watchlist/ui/AddTitleModal';
import type { OpenAddReading } from '../../modules/reading/ui/AddReadingModal';
import type { OpenAddGame } from '../../modules/games/ui/AddGameModal';
import { DraftChoiceModal } from '../../modules/drafts/ui/DraftChoiceModal';
import { createAddRoute } from '../AddRouter';

/** The Add dialogs the chooser routes to. */
export interface AddRouteCore {
	app: App;
	openAddTitle: OpenAddTitle;
	openAddReading: OpenAddReading;
	openAddGame: OpenAddGame;
}

/** Builds the Add chooser for Drafts and Custom Lists; the only place that `new`s its dialog. */
export function addRouteUi(core: AddRouteCore): OpenAddRoute {
	const { app, openAddTitle, openAddReading, openAddGame } = core;
	return createAddRoute((opts) => new DraftChoiceModal(app, opts).open(), openAddTitle, openAddReading, openAddGame);
}
