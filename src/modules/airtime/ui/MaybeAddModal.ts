import { App, Notice } from 'obsidian';
import type { SettingsReader } from '../../../shared/services/SettingsService';
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
	type TitleSearchApi,
	type TitleSearchResult,
} from '../../watchlist/ui/titleSearch';
import { SearchFormModal, type SearchPickerOptions } from '../../../shared/ui/SearchFormModal';

export type MaybeAddStore = Pick<DataManager, 'generateMaybeId' | 'addMaybeTitle'>;

export interface MaybeAddOptions {
	onAdded: () => void;
}

export type OpenMaybeAdd = (opts: MaybeAddOptions) => void;

export class MaybeAddModal extends SearchFormModal<TitleSearchResult> {
	private selectedType = 'Anime';

	private media: MediaFields = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly api: TitleSearchApi,
		private readonly titles: MaybeAddStore,
		private readonly opts: MaybeAddOptions,
	) {
		super(app, t('misc.maybeAdd.title'), ['hoard-add-modal']);
	}

	protected pickerOptions(): SearchPickerOptions<TitleSearchResult> {
		return titlePickerBase(this.settings, this.selectedType, (v) => {
			this.selectedType = v;
			this.renderForm();
		});
	}

	protected noApiMessage(): string | null {
		return null;
	}

	protected async search(query: string, year: string): Promise<TitleSearchResult[]> {
		const found = await searchTitles(this.settings, this.api, this.selectedType, query, year);
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
		if (await resolvePick(this.settings, this.api, result, isCurrent, (pick) => fillMediaFields(this.media, pick))) this.renderForm();
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
			id: this.titles.generateMaybeId(titleName),
			title: titleName,
			type: this.selectedType,
			releaseDate: this.media.releaseDate || null,
			externalLink: this.media.link,
			totalEpisodes: this.media.episodes,
			episodeDuration: this.media.duration,
			dateAdded: new Date().toISOString(),
		};
		await this.titles.addMaybeTitle(entry);
		new Notice(t('misc.maybeAdd.added', { title: titleName }));
		this.close();
		this.opts.onAdded();
	}
}
