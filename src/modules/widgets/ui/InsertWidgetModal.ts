import { App, FuzzySuggestModal } from 'obsidian';
import type { HoardTitle } from '../../../shared/domain/types';
import { t } from '../../../shared/i18n';
import { typeLabel } from '../../../shared/i18n/labels';

export interface InsertWidgetModalDeps {
	app: App;
}

/** Picks a title to insert into a note as a widget. */
export class InsertWidgetModal extends FuzzySuggestModal<HoardTitle> {
	private onSelect: (title: HoardTitle) => void;
	private titles: HoardTitle[];

	constructor(deps: InsertWidgetModalDeps, titles: HoardTitle[], onSelect: (title: HoardTitle) => void) {
		super(deps.app);
		this.titles = titles;
		this.onSelect = onSelect;
		this.setPlaceholder(t('widget.insertPlaceholder'));
	}

	getItems(): HoardTitle[] {
		return this.titles;
	}

	getItemText(title: HoardTitle): string {
		return `${title.title} (${typeLabel(title.type)})`;
	}

	onChooseItem(title: HoardTitle): void {
		this.onSelect(title);
	}
}
