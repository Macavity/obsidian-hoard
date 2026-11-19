import { App, Modal, Notice } from 'obsidian';
import { t } from '../../../shared/i18n';
import { createIconButton } from '../../../design-system/IconButton';
import type { SettingsReader } from '../../settings/contract';
import type { ReadingDataManager } from '../services/ReadingDataManager';
import type { ReadingKind } from '../contract';
import type { ReadingCustomColumn } from '../contract';
import { DEFAULT_FIELD_COLOR } from '../../../shared/domain/tags';
import type { OpenConfirm } from '../../../design-system/ConfirmModal';
import { openColorPicker } from '../../../design-system/ColorPicker';
import { attachCardDrag, renderTypeSelect, type DragState } from '../../../design-system/ColumnsEditor';
import { markViewRoot } from '../../../design-system/detailFrame';

export type ManageColumnsStore = Pick<
	ReadingDataManager,
	| 'getSettings' | 'updateSettings' | 'getBookColumns' | 'getMangaColumns' | 'isColumnNameTaken' | 'generateColumnId'
	| 'addColumn' | 'updateColumn' | 'removeColumn' | 'reorderColumns'
>;

export interface ManageColumnsOptions {
	kind: ReadingKind;
	onChanged: () => void;
}

export type OpenManageColumns = (opts: ManageColumnsOptions) => void;

export class ReadingManageColumnsModal extends Modal {
	private listEl: HTMLElement | null = null;
	private styleGroupEl: HTMLElement | null = null;
	private drag: DragState = { from: -1 };
	/** A rename moves keys across notes; until it settles, no other edit may start from stale cards. */
	private busy = false;

	constructor(
		app: App,
		private readonly settings: SettingsReader,
		private readonly reading: ManageColumnsStore,
		private readonly confirm: OpenConfirm,
		private readonly opts: ManageColumnsOptions,
	) {
		super(app);
	}

	onOpen(): void {
		markViewRoot(this.modalEl, this.contentEl, this.settings.get().colorTheme);
		this.contentEl.addClass('hoard-reading-modal');
		this.contentEl.addClass('hoard-reading-columns');
		this.titleEl.setText(this.title());
		this.build();
	}

	private title(): string {
		return t(this.opts.kind === 'book' ? 'reading.columns.titleBook' : 'reading.columns.titleManga');
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private build(): void {
		const c = this.contentEl;
		c.empty();

		const header = c.createDiv({ cls: 'hoard-reading-modal__header' });
		header.createSpan({
			cls: 'hoard-reading-modal__header-icon',
			text: this.opts.kind === 'book' ? '📖' : '📓',
		});
		header.createSpan({
			cls: 'hoard-reading-modal__header-title',
			text: this.title(),
		});

		c.createDiv({
			cls: 'hoard-reading-columns__description',
			text: t('reading.columns.description'),
		});

		this.renderStyleToggle(c);

		this.listEl = c.createDiv({ cls: 'hoard-reading-columns__list' });
		this.renderList();

		c.createDiv({ cls: 'hoard-reading-modal__divider' });
		this.renderAddSection(c);

		const footer = c.createDiv({ cls: 'hoard-reading-modal__footer' });
		const closeBtn = footer.createEl('button', { cls: 'hoard-btn', text: t('common.close') });
		closeBtn.addEventListener('click', () => this.close());
	}

	private renderStyleToggle(parent: HTMLElement): void {
		const settings = this.reading.getSettings();
		const currentStyle = this.opts.kind === 'book'
			? (settings.bookCustomFieldStyle ?? 'fill')
			: (settings.mangaCustomFieldStyle ?? 'fill');

		const row = parent.createDiv({ cls: 'hoard-reading-columns__style-row' });
		row.createSpan({ cls: 'hoard-reading-columns__style-label', text: t('reading.columns.displayStyle') });

		this.styleGroupEl = row.createDiv({ cls: 'hoard-reading-columns__style-group' });

		for (const opt of ['fill', 'border'] as const) {
			const btn = this.styleGroupEl.createEl('button', {
				cls: `hoard-reading-columns__style-btn${currentStyle === opt ? ' is-active' : ''}`,
				text: t(opt === 'fill' ? 'reading.columns.styleFill' : 'reading.columns.styleBorder'),
			});
			btn.addEventListener('click', () => {
				void (async () => {
					const key = this.opts.kind === 'book' ? 'bookCustomFieldStyle' : 'mangaCustomFieldStyle';
					await this.reading.updateSettings({ [key]: opt });
					this.opts.onChanged();
					this.styleGroupEl?.querySelectorAll('.hoard-reading-columns__style-btn').forEach((b) => {
						b.removeClass('is-active');
					});
					btn.addClass('is-active');
				})();
			});
		}
	}

	private getColumns(): ReadingCustomColumn[] {
		return this.opts.kind === 'book'
			? this.reading.getBookColumns()
			: this.reading.getMangaColumns();
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const cols = this.getColumns();

		if (cols.length === 0) {
			this.listEl.createDiv({
				cls: 'hoard-reading-columns__empty',
				text: t('reading.columns.empty'),
			});
			return;
		}

		cols.forEach((col, idx) => {
			const card = this.listEl!.createDiv({ cls: 'hoard-edit-columns__card hoard-reading-columns__card' });

			attachCardDrag(card, idx, this.drag, (from, to) => void this.reorder(from, to));

			const nameInput = card.createEl('input', {
				cls: 'hoard-modal__input hoard-edit-columns__card-name',
				attr: { type: 'text', placeholder: t('reading.columns.fieldName') },
			});
			nameInput.value = col.name;
			nameInput.addEventListener('change', () => {
				const next = nameInput.value.trim();
				if (!next) {
					nameInput.value = col.name;
					return;
				}
				if (next === col.name) return;
				if (this.reading.isColumnNameTaken(this.opts.kind, next, col.id)) {
					new Notice(t('reading.columns.nameTaken'));
					nameInput.value = col.name;
					return;
				}
				void this.updateColumn({ ...col, name: next });
			});

			const typeSelect = renderTypeSelect(card, col.type);

			const colorDot = card.createEl('button', { cls: 'hoard-color-picker__dot' });
			colorDot.setCssProps({ '--hoard-color-picker-dot-color': col.color ?? DEFAULT_FIELD_COLOR });
			colorDot.title = t('reading.columns.chooseColor');
			colorDot.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openColorPalette(colorDot, col);
			});

			const optsInput = card.createEl('input', {
				cls: 'hoard-modal__input hoard-reading-columns__options-input',
				attr: { type: 'text', placeholder: t('reading.columns.optionValues') },
			});
			optsInput.value = col.options.join(', ');
			optsInput.toggleClass('is-invisible', col.type !== 'select');
			optsInput.addEventListener('change', () => {
				const parsed = optsInput.value
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				void this.updateColumn({ ...col, options: parsed });
			});

			typeSelect.addEventListener('change', () => {
				const type = typeSelect.value as ReadingCustomColumn['type'];
				optsInput.toggleClass('is-invisible', type !== 'select');
				void this.updateColumn({ ...col, type });
			});

			const delBtn = createIconButton(card, { icon: 'x', label: t('reading.columns.deleteField'), cls: 'hoard-edit-columns__card-delete' });
			delBtn.addEventListener('click', () => {
				this.confirm(
					t(
						this.opts.kind === 'book' ? 'reading.columns.deleteConfirmBook' : 'reading.columns.deleteConfirmManga',
						{ name: col.name },
					),
					() => void this.deleteColumn(col.id),
				);
			});
		});
	}

	private openColorPalette(anchor: HTMLElement, col: ReadingCustomColumn): void {
		openColorPicker({
			anchor,
			container: this.contentEl,
			current: col.color ?? DEFAULT_FIELD_COLOR,
			allowCustom: true,
			onPick: (color) => { void this.updateColumn({ ...col, color: color ?? undefined }); },
		});
	}

	private renderAddSection(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: 'hoard-reading-columns__add' });
		wrap.createDiv({ cls: 'hoard-reading-modal__section-label', text: t('reading.columns.addField') });

		const row = wrap.createDiv({ cls: 'hoard-reading-columns__add-row' });

		const nameInput = row.createEl('input', {
			cls: 'hoard-modal__input hoard-reading-columns__add-name',
			attr: { type: 'text', placeholder: t('reading.columns.fieldName') },
		});

		const typeSelect = row.createEl('select', { cls: 'hoard-input__select hoard-reading-columns__add-type' });
		const typeLabels = {
			text: t('ui.columns.typeText'),
			number: t('ui.columns.typeNumber'),
			select: t('ui.columns.typeSelect'),
		};
		for (const type of ['text', 'number', 'select'] as const) {
			typeSelect.createEl('option', { value: type, text: typeLabels[type] });
		}

		const optsInput = row.createEl('input', {
			cls: 'hoard-modal__input hoard-reading-columns__add-options',
			attr: {
				type: 'text',
				placeholder: t('reading.columns.optionsPlaceholder'),
			},
		});
		const refreshOpts = (): void => {
			optsInput.toggleClass('is-hidden', typeSelect.value !== 'select');
		};
		typeSelect.addEventListener('change', refreshOpts);
		refreshOpts();

		const addBtn = row.createEl('button', {
			cls: 'hoard-reading-modal__add-btn hoard-btn--success hoard-reading-columns__add-btn',
			text: t('common.add'),
		});
		addBtn.addEventListener('click', () => {
			const name = nameInput.value.trim();
			if (!name) {
				new Notice(t('reading.columns.enterName'));
				return;
			}
			if (this.reading.isColumnNameTaken(this.opts.kind, name)) {
				new Notice(t('reading.columns.nameTaken'));
				return;
			}
			const type = typeSelect.value as ReadingCustomColumn['type'];
			const options =
				type === 'select'
					? optsInput.value
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean)
					: [];
			const col: ReadingCustomColumn = {
				id: this.reading.generateColumnId(this.opts.kind, name),
				name,
				type,
				options,
				color: DEFAULT_FIELD_COLOR,
			};
			void this.addColumn(col).then(() => {
				nameInput.value = '';
				optsInput.value = '';
				typeSelect.value = 'text';
				refreshOpts();
			});
		});
	}

	private async addColumn(col: ReadingCustomColumn): Promise<void> {
		if (this.busy) return;
		await this.reading.addColumn(this.opts.kind, col);
		this.renderList();
		this.opts.onChanged();
	}

	private async updateColumn(col: ReadingCustomColumn): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.setLocked(true);
		try {
			const { moved, skipped } = await this.reading.updateColumn(this.opts.kind, col);
			if (moved > 0) new Notice(t('reading.columns.renamed', { count: moved }));
			if (skipped > 0) new Notice(t('reading.columns.renamedSkipped', { count: skipped }));
		} finally {
			this.busy = false;
			this.setLocked(false);
		}
		this.renderList();
		this.opts.onChanged();
	}

	private setLocked(locked: boolean): void {
		this.contentEl
			.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')
			.forEach((el) => {
				if (!el.closest('.hoard-reading-modal__footer')) el.disabled = locked;
			});
	}

	private async deleteColumn(id: string): Promise<void> {
		if (this.busy) return;
		await this.reading.removeColumn(this.opts.kind, id);
		this.renderList();
		this.opts.onChanged();
	}

	private async reorder(from: number, to: number): Promise<void> {
		if (this.busy) return;
		await this.reading.reorderColumns(this.opts.kind, from, to);
		this.renderList();
		this.opts.onChanged();
	}
}
