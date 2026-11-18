import { App, Notice } from 'obsidian';
import { t } from '../../../shared/i18n';
import type { DataManager } from '../../watchlist/services/DataManager';
import type { MaybeTitle } from '../../../shared/domain/types';
import { formatDateDisplay } from '../../../shared/domain/types';
import {
	renderMediaFields,
	resetForm,
	type MediaFields,
} from '../../../shared/ui/FormCells';
import {
	episodesLabel,
	fillMediaFields,
	resolvePick,
	searchTitles,
	titlePickerBase,
	type TitleSearchDeps,
	type TitleSearchResult,
} from '../../watchlist/ui/titleSearch';
import { SearchFormModal, type SearchPickerOptions } from '../../../shared/ui/SearchFormModal';

export interface MaybeAddModalDeps extends TitleSearchDeps {
	app: App;
	titles: Pick<DataManager, 'generateMaybeId' | 'addMaybeTitle'>;
}

export class MaybeAddModal extends SearchFormModal<TitleSearchResult> {
	private onAdded: () => void;

	private selectedType = 'Anime';

	private media: MediaFields = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };

	constructor(
		private deps: MaybeAddModalDeps,
		onAdded: () => void,
	) {
		super(deps.app, t('misc.maybeAdd.title'), ['hoard-add-modal']);
		this.onAdded = onAdded;
	}

	protected pickerOptions(): SearchPickerOptions<TitleSearchResult> {
		return titlePickerBase(this.deps, this.selectedType, (v) => {
			this.selectedType = v;
			this.renderForm();
		});
	}

	protected noApiMessage(): string | null {
		return null;
	}

	protected async search(query: string, year: string): Promise<TitleSearchResult[]> {
		const found = await searchTitles(this.deps, this.selectedType, query, year);
		if (found) return found;
		new Notice(t('misc.maybeAdd.noApi', { type: this.selectedType }));
		return [];
	}

	protected renderResult(host: HTMLElement, result: TitleSearchResult, select: (itemEl: HTMLElement) => void): HTMLElement {
		const item = host.createDiv({ cls: 'hoard-search-picker__result-item' });
		item.createDiv({ cls: 'hoard-search-picker__result-title', text: result.title });
		item.createDiv({ cls: 'hoard-search-picker__result-meta', text: `${episodesLabel(result)} · ${formatDateDisplay(result.releaseDate)}` });
		item.addEventListener('click', () => select(item));
		return item;
	}

	protected async selectResult(result: TitleSearchResult, isCurrent: () => boolean): Promise<void> {
		if (await resolvePick(this.deps, result, isCurrent, (pick) => fillMediaFields(this.media, pick))) this.renderForm();
	}

	protected renderForm(): void {
		const form = resetForm(this.formEl);
		if (!form) return;
		renderMediaFields(form, this.media, false);

		const btnRow = form.createDiv({ cls: 'hoard-modal__btn-row' });
		const addBtn = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('misc.maybeAdd.submit') });
		addBtn.addEventListener('click', () => void this.addMaybeTitle());
	}

	private async addMaybeTitle(): Promise<void> {
		const titleName = this.media.title.trim();
		if (!titleName) { new Notice(t('misc.maybeAdd.titleRequired')); return; }

		const entry: MaybeTitle = {
			id: this.deps.titles.generateMaybeId(titleName),
			title: titleName,
			type: this.selectedType,
			releaseDate: this.media.releaseDate || null,
			externalLink: this.media.link,
			totalEpisodes: this.media.episodes,
			episodeDuration: this.media.duration,
			dateAdded: new Date().toISOString(),
		};
		await this.deps.titles.addMaybeTitle(entry);
		new Notice(t('misc.maybeAdd.added', { title: titleName }));
		this.close();
		this.onAdded();
	}
}
