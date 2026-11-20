import { FuzzySuggestModal, type App, type TFile } from 'obsidian';
import { t } from '../../../shared/i18n';

export class VaultFilePicker extends FuzzySuggestModal<TFile> {
	private onPick: (file: TFile) => void;
	private files: TFile[];

	constructor(app: App, files: TFile[], onPick: (file: TFile) => void) {
		super(app);
		this.files = files;
		this.onPick = onPick;
		this.setPlaceholder(t('add.reading.pickNote'));
	}

	getItems(): TFile[] {
		return this.files;
	}
	getItemText(item: TFile): string {
		return item.path;
	}
	onChooseItem(item: TFile): void {
		this.onPick(item);
	}
}
