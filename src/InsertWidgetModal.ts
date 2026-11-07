import { App, FuzzySuggestModal } from 'obsidian';
import type { HoardTitle } from './types';

export class InsertWidgetModal extends FuzzySuggestModal<HoardTitle> {
	private onSelect: (title: HoardTitle) => void;
	private titles: HoardTitle[];

	constructor(app: App, titles: HoardTitle[], onSelect: (title: HoardTitle) => void) {
		super(app);
		this.titles = titles;
		this.onSelect = onSelect;
		this.setPlaceholder('Search for a title to insert...');
	}

	getItems(): HoardTitle[] {
		return this.titles;
	}

	getItemText(title: HoardTitle): string {
		return `${title.title} (${title.type})`;
	}

	onChooseItem(title: HoardTitle): void {
		this.onSelect(title);
	}
}
