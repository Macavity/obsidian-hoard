import { App, FuzzySuggestModal } from 'obsidian';
import type { HoardTitle } from '../../watchlist/contract';
import { t } from '../../../shared/i18n';
import { typeLabel } from '../../../shared/i18n/labels';

export interface InsertWidgetOptions {
	titles: HoardTitle[];
	onSelect: (title: HoardTitle) => void;
}

/** Picks a title to insert into a note as a widget. */
export class InsertWidgetModal extends FuzzySuggestModal<HoardTitle> {

	constructor(
		app: App,
		private readonly opts: InsertWidgetOptions,
	) {
		super(app);
		this.setPlaceholder(t('widget.insertPlaceholder'));
	}

	getItems(): HoardTitle[] {
		return this.opts.titles;
	}

	getItemText(title: HoardTitle): string {
		return `${title.title} (${typeLabel(title.type)})`;
	}

	onChooseItem(title: HoardTitle): void {
		this.opts.onSelect(title);
	}
}
