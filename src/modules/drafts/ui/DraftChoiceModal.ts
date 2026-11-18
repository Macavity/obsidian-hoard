import { App, Modal } from 'obsidian';
import { t } from '../../../shared/i18n';
import { renderChoiceGrid } from '../../../shared/ui/choiceGrid';

export type DraftAddChoice = 'watchlist' | 'book' | 'manga' | 'game';

export interface DraftChoiceOptions {
	draftText: string;
	onChoice: (choice: DraftAddChoice) => void;
	heading?: string;
}

export type OpenDraftChoice = (opts: DraftChoiceOptions) => void;

/**
 * Choice modal shown when adding a draft: four inline options (Watchlist / Book / Manga / Game),
 * each routing to its own Add modal. The draft's text is the subtitle.
 */
export class DraftChoiceModal extends Modal {
	constructor(
		app: App,
		private readonly opts: DraftChoiceOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('hoard-draft-choice');

		this.titleEl.setText(this.opts.heading ?? t('misc.draftChoice.heading'));
		contentEl.createDiv({ cls: 'hoard-draft-choice__subtitle', text: this.opts.draftText });

		renderChoiceGrid<DraftAddChoice>(
			contentEl,
			[
				{ label: t('misc.draftChoice.addWatchlist'), choice: 'watchlist' },
				{ label: t('misc.draftChoice.addBook'), choice: 'book' },
				{ label: t('misc.draftChoice.addManga'), choice: 'manga' },
				{ label: t('misc.draftChoice.addGame'), choice: 'game' },
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
