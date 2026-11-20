import type { TitleWriter } from '../../watchlist/exports';
import { App, Notice } from 'obsidian';
import type { SettingsReader } from '../../settings/exports';
import { t } from '../../../shared/i18n';
import type { MaybeTitle } from '../../watchlist/exports';
import type { SourceType } from '../../../shared/domain/sourceType';
import { typeLabel } from '../../../shared/i18n/labels';
import { formatDateDisplay } from '../../../shared/domain/date';
import {
	makeRow,
	nameSelect,
	renderMediaFields,
	resetForm,
} from '../../../design-system/FormCells';
import { episodesLabel, fillMediaFields, resolvePick, searchTitles, titlePickerBase, type TitleSearchApi, type TitleSearchResult, type MediaFields } from '../../../shared/services/titleSearch';
import { SearchFormModal, type SearchPickerOptions } from '../../../design-system/SearchFormModal';

export type MaybeAddStore = Pick<TitleWriter, 'generateMaybeId' | 'addMaybeTitle'>;

export interface MaybeAddOptions {
	onAdded: () => void;
}

export type OpenMaybeAdd = (opts: MaybeAddOptions) => void;

export class MaybeAddModal extends SearchFormModal<TitleSearchResult> {
	private selectedSourceType: SourceType = 'Anime';
	private selectedType: string;

	private media: MediaFields = { title: '', episodes: 0, duration: 0, releaseDate: '', link: '' };

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly api: TitleSearchApi,
		private readonly titles: MaybeAddStore,
		private readonly opts: MaybeAddOptions,
	) {
		super(app, t('misc.maybeAdd.title'), ['hoard-add-modal']);
		this.selectedType = settings.get().types[0]?.name ?? '';
	}

	protected pickerOptions(): SearchPickerOptions<TitleSearchResult> {
		return titlePickerBase(this.selectedSourceType, (v) => { this.selectedSourceType = v; });
	}

	protected noApiMessage(): string | null {
		return null;
	}

	protected async search(query: string, year: string): Promise<TitleSearchResult[]> {
		return await searchTitles(this.settings, this.api, this.selectedSourceType, query, year);
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
		nameSelect(makeRow(form, t('add.type')), this.settings.get().types.map((ty) => ty.name), this.selectedType,
			(v) => { this.selectedType = v; }, false, typeLabel);

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
			sourceType: this.selectedSourceType,
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
