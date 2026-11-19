import { App, Modal } from 'obsidian';
import { t } from '../../../shared/i18n';
import { renderChoiceGrid } from '../../../design-system/choiceGrid';

export type AddTitleChoice = 'url' | 'manual';

export interface AddTitleChoiceOptions {
	onChoice: (choice: AddTitleChoice) => void;
}

export type OpenAddTitleChoice = (opts: AddTitleChoiceOptions) => void;

/**
 * Chooser shown when adding a title to the Watchlist: Add from URL, or Add manually / via API. This
 * modal only routes — no form logic.
 */
export class AddTitleChoiceModal extends Modal {
	constructor(
		app: App,
		private readonly opts: AddTitleChoiceOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('hoard-draft-choice');

		this.titleEl.setText(t('add.choice.title'));

		renderChoiceGrid<AddTitleChoice>(
			contentEl,
			[
				{ label: t('add.choice.fromUrl'), choice: 'url' },
				{ label: t('add.choice.manual'), choice: 'manual' },
			],
			(choice) => {
				this.close();
				this.opts.onChoice(choice);
			},
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
