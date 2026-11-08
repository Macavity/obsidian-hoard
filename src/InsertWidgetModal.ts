import { App, FuzzySuggestModal } from 'obsidian';
import type { HoardTitle } from './types';
import { t } from './i18n';
import { typeLabel } from './i18n/labels';

export class InsertWidgetModal extends FuzzySuggestModal<HoardTitle> {
	private onSelect: (title: HoardTitle) => void;
	private titles: HoardTitle[];

	constructor(app: App, titles: HoardTitle[], onSelect: (title: HoardTitle) => void) {
		super(app);
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
