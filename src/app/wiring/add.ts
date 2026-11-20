import type { App } from 'obsidian';
import type { AddProvider, OpenAddWizard } from '../../modules/add/exports';
import { AddWizardModal } from '../../modules/add/ui/AddWizardModal';

export interface AddCore {
	app: App;
	/** Read when the wizard opens, so tabs built before the providers exist can already hold `openAddWizard`. */
	providers: () => readonly AddProvider[];
}

/** Builds the central add wizard; the only place that `new`s its dialog. */
export function addUi(core: AddCore): { openAddWizard: OpenAddWizard } {
	const { app, providers } = core;
	return {
		openAddWizard: (opts) => { new AddWizardModal(app, providers(), opts).open(); },
	};
}
