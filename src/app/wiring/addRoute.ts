import type { App } from 'obsidian';
import type { OpenAddRoute } from '../../shared/services/addRoute';
import type { OpenAddWizard } from '../../modules/add/exports';
import { DraftChoiceModal } from '../../modules/drafts/ui/DraftChoiceModal';
import { createAddRoute } from '../AddRouter';

/** The Add dialogs the chooser routes to. */
export interface AddRouteCore {
	app: App;
	openAddWizard: OpenAddWizard;
}

/** Builds the Add chooser for Drafts and Custom Lists; the only place that `new`s its dialog. */
export function addRouteUi(core: AddRouteCore): OpenAddRoute {
	const { app, openAddWizard } = core;
	return createAddRoute((opts) => new DraftChoiceModal(app, opts).open(), openAddWizard);
}
