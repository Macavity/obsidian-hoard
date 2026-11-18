import { App, Modal, Notice } from 'obsidian';
import { t } from '../../../shared/i18n';
import { typeLabel } from '../../../shared/i18n/labels';
import { blockDuplicate, createDuplicateGuard } from '../../../shared/ui/DuplicateGuard';
import {
	linkField,
	makeCell,
	makeRow as makeFormRow,
	nameSelect,
	numberInput,
	renderGroupPicker,
	titleField,
	type GroupPickerState,
} from '../../../shared/ui/FormCells';
import type { DataManager } from '../services/DataManager';
import type { SettingsReader } from '../../../shared/services/SettingsService';
import type { HoardTitle, HoardGroup, Season } from '../../../shared/domain/types';
import { completedEpisodes } from '../../../shared/domain/entryFactories';
import { formatSeasonLine, parseSeasonLine, seasonsOf } from '../../../shared/domain/seasonText';

/** Seasons from the seasons box, one "Name: N" or "Name: N (skip list)" per line. No bounds are applied here. */
function parseSeasonsText(text: string): Season[] {
	return seasonsOf(text.split('\n').map(parseSeasonLine).filter((l) => l !== null));
}

function seasonsToText(seasons: Season[]): string {
	return seasons.map(formatSeasonLine).join('\n');
}

export interface EditTitleModalDeps {
	app: App;
	settings: SettingsReader;
	titles: Pick<
		DataManager,
		'getTitles' | 'getGroups' | 'getGroup' | 'updateTitle' | 'updateGroup' | 'generateGroupId' | 'addTitleToGroup' | 'addGroup'
	>;
}

export class EditTitleModal extends Modal {
	private original: HoardTitle;
	private onSaved: () => void;

	// editable state. Status, priority, rating, notes, the watch dates and the release date are
	// deliberately absent — they're edited in the detail modal and the expanded row, and carry over
	// untouched on save.
	private fieldTitle: string;
	private fieldType: string;
	private fieldEpisodes: number;
	private fieldDuration: number;
	private fieldLink: string;
	private fieldSeasonsText: string;
	private fieldReview: string;
	private fieldPosterUrl: string;
	private fieldTrailerUrl: string;
	// group assignment (mirrors AddTitleModal). `originalGroupId` records the group on open, so save
	// moves/detaches only when it changed.
	private originalGroupId = '';
	private group: GroupPickerState = { selectedGroupId: '', newGroupName: '' };
	private duplicates = createDuplicateGuard();

	constructor(
		private deps: EditTitleModalDeps,
		title: HoardTitle,
		onSaved: () => void,
	) {
		super(deps.app);
		this.original = title;
		this.onSaved = onSaved;

		this.fieldTitle = title.title;
		this.fieldType = title.type;
		this.fieldEpisodes = title.totalEpisodes;
		this.fieldDuration = title.episodeDuration;
		this.fieldLink = title.externalLink;
		this.fieldSeasonsText = seasonsToText(title.seasons);
		this.fieldReview = title.review ?? '';
		this.fieldPosterUrl = title.posterUrl ?? '';
		this.fieldTrailerUrl = title.manualTrailerUrl ?? '';
		// seed the group dropdown with the title's current group
		this.originalGroupId =
			this.deps.titles.getGroups().find((g) => g.titleIds.includes(title.id))?.id ?? '';
		this.group.selectedGroupId = this.originalGroupId;
	}

	onOpen(): void {
		this.titleEl.setText(t('edit.heading', { title: this.original.title }));
		this.contentEl.addClass('hoard-add-modal');
		this.buildUI();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private buildUI(): void {
		const content = this.contentEl;
		content.empty();

		const makeRow = (label: string): HTMLElement => makeFormRow(content, label);

		titleField(content, this.fieldTitle, undefined, (v) => { this.fieldTitle = v; });

		nameSelect(makeRow(t('edit.type')), this.deps.settings.get().types.map((t) => t.name), this.fieldType,
			(v) => { this.fieldType = v; }, false, typeLabel);

		// total episodes + ep. duration paired on one row (episodes keeps its seasons skip/watch inline
		// labels — only the layout changed)
		const epsDurRow = content.createDiv({ cls: 'hoard-modal__row hoard-modal__row--pair' });
		const epsCell = makeCell(epsDurRow, t('edit.totalEpisodes'));
		numberInput(epsCell, {
			value: this.fieldEpisodes,
			min: 0,
			onInput: (v) => {
				this.fieldEpisodes = v;
				updateSkipCounts();
			},
		});
		const epsSkipLabel = epsCell.createSpan({ cls: 'hoard-modal__skip-inline' });
		const epsWatchLabel = epsCell.createSpan({ cls: 'hoard-modal__skip-inline' });

		const updateSkipCounts = (): void => {
			const parsed = parseSeasonsText(this.fieldSeasonsText);
			const totalSkipped = parsed.reduce((sum, s) => sum + (s.skippedEpisodes?.length ?? 0), 0);
			if (totalSkipped === 0) {
				epsSkipLabel.textContent = '';
				epsWatchLabel.textContent = '';
				return;
			}
			const toWatch = Math.max(0, this.fieldEpisodes - totalSkipped);
			epsSkipLabel.textContent = t('edit.toSkip', { count: totalSkipped });
			epsWatchLabel.textContent = t('edit.toWatch', { count: toWatch });
		};

		numberInput(makeCell(epsDurRow, t('edit.episodeDuration'), true), {
			value: this.fieldDuration,
			min: 0,
			onInput: (v) => { this.fieldDuration = v; },
		});

		linkField(content, this.fieldLink, 'HTTPS://...', (v) => { this.fieldLink = v; });

		// poster URL (the note's `Cover` property)
		const posterRow = makeRow(t('edit.posterUrl'));
		const posterStack = posterRow.createDiv({ cls: 'hoard-modal__input-stack' });
		const posterInput = posterStack.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'url', placeholder: 'https://example.com/poster.jpg' },
		});
		posterInput.value = this.fieldPosterUrl;
		posterInput.addEventListener('input', () => { this.fieldPosterUrl = posterInput.value; });
		posterStack.createDiv({
			cls: 'hoard-modal__info',
			text: t('edit.posterHelp'),
		});

		// trailer URL (manual override)
		const trailerRow = makeRow(t('edit.trailerUrl'));
		const trailerStack = trailerRow.createDiv({ cls: 'hoard-modal__input-stack' });
		const trailerInput = trailerStack.createEl('input', {
			cls: 'hoard-modal__input',
			attr: { type: 'url', placeholder: 'https://www.youtube.com/watch?v=...' },
		});
		trailerInput.value = this.fieldTrailerUrl;
		trailerInput.addEventListener('input', () => { this.fieldTrailerUrl = trailerInput.value; });
		trailerStack.createDiv({
			cls: 'hoard-modal__info',
			text: t('edit.trailerHelp'),
		});

		// group assignment (move / create), seeded with the title's current group
		renderGroupPicker(content, this.deps.titles.getGroups(), this.group);

		const seasonsRow = makeRow(t('edit.seasons'));
		const seasonsHelp = seasonsRow.createDiv({ cls: 'hoard-modal__input-stack' });
		const seasonsInput = seasonsHelp.createEl('textarea', {
			cls: 'hoard-modal__textarea',
			attr: { rows: '4', placeholder: 'Season 1: 12\nSeason 2: 13 (5,8,33-37)' },
		});
		seasonsInput.value = this.fieldSeasonsText;

		const totalPreviewEl = seasonsHelp.createDiv({ cls: 'hoard-modal__season-total' });
		const updateTotalPreview = (): void => {
			const parsed = parseSeasonsText(seasonsInput.value);
			const total = parsed.reduce((sum, s) => sum + s.episodes, 0);
			const totalSkipped = parsed.reduce((sum, s) => sum + (s.skippedEpisodes?.length ?? 0), 0);
			totalPreviewEl.textContent = totalSkipped > 0
				? t('edit.totalPreviewSkip', { total, skipped: totalSkipped })
				: t('edit.totalPreview', { total });
		};
		updateTotalPreview();
		updateSkipCounts();

		seasonsInput.addEventListener('input', () => {
			this.fieldSeasonsText = seasonsInput.value;
			updateTotalPreview();
			updateSkipCounts();
		});

		seasonsHelp.createDiv({
			cls: 'hoard-modal__info',
			text: t('edit.formatHelp'),
		});
		seasonsHelp.createDiv({
			cls: 'hoard-modal__info',
			text: t('edit.skipHelp'),
		});
		seasonsHelp.createDiv({
			cls: 'hoard-modal__info',
			text: t('edit.totalNote'),
		});

		const btnRow = content.createDiv({ cls: 'hoard-modal__btn-row' });
		const cancelBtn = btnRow.createEl('button', { cls: 'hoard-btn', text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
		const saveBtn = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('edit.saveChanges') });
		saveBtn.addEventListener('click', () => void this.saveTitle());
	}

	private async saveTitle(): Promise<void> {
		const titleName = this.fieldTitle.trim();
		if (!titleName) {
			new Notice(t('edit.emptyName'));
			return;
		}

		const isDuplicate = this.deps.titles.getTitles().some(
			(t) => t.id !== this.original.id && t.title.toLowerCase() === titleName.toLowerCase()
		);
		const blocked = blockDuplicate(this.contentEl, this.duplicates, {
			name: titleName,
			isDuplicate,
			verb: 'Save',
			retry: () => void this.saveTitle(),
		});
		if (blocked) return;

		const seasons = parseSeasonsText(this.fieldSeasonsText);

		// status, priority, rating, notes, the watch dates and the release date aren't edited here —
		// spreading the original carries their current values through, so a save can't clobber an edit made
		// elsewhere
		const updated: HoardTitle = {
			...this.original,
			title: titleName,
			type: this.fieldType,
			review: this.fieldReview,
			totalEpisodes: this.fieldEpisodes,
			episodeDuration: this.fieldDuration,
			externalLink: this.fieldLink,
			seasons,
			// keep an already-Completed title fully ticked when its episode count changes here
			watchedEpisodes: completedEpisodes(this.original.status, this.fieldEpisodes) ?? this.original.watchedEpisodes,
			posterUrl: this.fieldPosterUrl.trim(),
			manualTrailerUrl: this.fieldTrailerUrl.trim(),
		};

		await this.deps.titles.updateTitle(updated);

		// group membership (move / create) — only act when the selection changed relative to the original
		const newGroupName = this.group.newGroupName.trim();
		const groupChanged = newGroupName !== '' || this.group.selectedGroupId !== this.originalGroupId;
		if (groupChanged) {
			// detach from the previous group first
			if (this.originalGroupId) {
				const old = this.deps.titles.getGroup(this.originalGroupId);
				if (old) {
					old.titleIds = old.titleIds.filter((id) => id !== updated.id);
					await this.deps.titles.updateGroup(old);
				}
			}
			if (newGroupName) {
				const group: HoardGroup = {
					id: this.deps.titles.generateGroupId(newGroupName),
					name: newGroupName,
					titleIds: [updated.id],
					dateAdded: new Date().toISOString(),
				};
				await this.deps.titles.addGroup(group);
			} else if (this.group.selectedGroupId) {
				await this.deps.titles.addTitleToGroup(this.group.selectedGroupId, updated.id);
			}
			// else: moved to "— none —" — detached only
		}

		new Notice(t('edit.updated', { name: titleName }));
		this.close();
		this.onSaved();
	}
}
