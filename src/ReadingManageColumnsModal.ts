import { App, Modal, Notice } from 'obsidian';
import type HoardPlugin from './main';
import type { ReadingDataManager } from './ReadingDataManager';
import { ReadingCustomColumn, DEFAULT_FIELD_COLOR } from './types';
import { ConfirmModal } from './ConfirmModal';
import { openColorPicker } from './ColorPicker';
import { attachCardDrag, renderTypeSelect, type DragState } from './ui/ColumnsEditor';

type Kind = 'book' | 'manga';

export class ReadingManageColumnsModal extends Modal {
	private plugin: HoardPlugin;
	private readingData: ReadingDataManager;
	private kind: Kind;
	private onChanged: () => void;
	private listEl: HTMLElement | null = null;
	private styleGroupEl: HTMLElement | null = null;
	private drag: DragState = { from: -1 };

	constructor(
		app: App,
		plugin: HoardPlugin,
		readingData: ReadingDataManager,
		kind: Kind,
		onChanged: () => void,
	) {
		super(app);
		this.plugin = plugin;
		this.readingData = readingData;
		this.kind = kind;
		this.onChanged = onChanged;
	}

	onOpen(): void {
		const colorTheme = this.plugin.settings.colorTheme ?? 'default';
		this.modalEl.setAttribute('data-theme', colorTheme);
		this.contentEl.setAttribute('data-theme', colorTheme);
		this.contentEl.addClass('hoard-view');
		this.contentEl.addClass('hoard-reading-modal');
		this.contentEl.addClass('hoard-reading-manage-cols');
		this.titleEl.setText(this.kind === 'book' ? 'Manage book fields' : 'Manage manga fields');
		this.build();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private build(): void {
		const c = this.contentEl;
		c.empty();

		const header = c.createDiv({ cls: 'hoard-reading-modal-header' });
		header.createSpan({
			cls: 'hoard-reading-modal-header-icon',
			text: this.kind === 'book' ? '📖' : '📓',
		});
		header.createSpan({
			cls: 'hoard-reading-modal-header-title',
			text: this.kind === 'book' ? 'Manage book fields' : 'Manage manga fields',
		});

		c.createDiv({
			cls: 'hoard-reading-manage-cols-desc',
			text: 'Custom fields appear in the title detail modal. Changes save automatically.',
		});

		this.renderStyleToggle(c);

		this.listEl = c.createDiv({ cls: 'hoard-reading-manage-cols-list' });
		this.renderList();

		c.createDiv({ cls: 'hoard-reading-modal-divider' });
		this.renderAddSection(c);

		const footer = c.createDiv({ cls: 'hoard-reading-modal-footer' });
		const closeBtn = footer.createEl('button', { cls: 'hoard-btn', text: 'Close' });
		closeBtn.addEventListener('click', () => this.close());
	}

	private renderStyleToggle(parent: HTMLElement): void {
		const settings = this.readingData.getSettings();
		const currentStyle = this.kind === 'book'
			? (settings.bookCustomFieldStyle ?? 'fill')
			: (settings.mangaCustomFieldStyle ?? 'fill');

		const row = parent.createDiv({ cls: 'hoard-reading-cols-style-row' });
		row.createSpan({ cls: 'hoard-reading-cols-style-label', text: 'Display style:' });

		this.styleGroupEl = row.createDiv({ cls: 'hoard-reading-cols-style-group' });

		for (const opt of ['fill', 'border'] as const) {
			const btn = this.styleGroupEl.createEl('button', {
				cls: `hoard-reading-cols-style-btn${currentStyle === opt ? ' is-active' : ''}`,
				text: opt.charAt(0).toUpperCase() + opt.slice(1),
			});
			btn.addEventListener('click', () => {
				void (async () => {
					const key = this.kind === 'book' ? 'bookCustomFieldStyle' : 'mangaCustomFieldStyle';
					await this.readingData.updateSettings({ [key]: opt });
					this.onChanged();
					this.styleGroupEl?.querySelectorAll('.hoard-reading-cols-style-btn').forEach((b) => {
						b.removeClass('is-active');
					});
					btn.addClass('is-active');
				})();
			});
		}
	}

	private getColumns(): ReadingCustomColumn[] {
		return this.kind === 'book'
			? this.readingData.getBookColumns()
			: this.readingData.getMangaColumns();
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();
		const cols = this.getColumns();

		if (cols.length === 0) {
			this.listEl.createDiv({
				cls: 'hoard-reading-manage-cols-empty',
				text: 'No custom fields yet. Add one below.',
			});
			return;
		}

		cols.forEach((col, idx) => {
			const card = this.listEl!.createDiv({ cls: 'hoard-editcol-card hoard-reading-col-card' });

			attachCardDrag(card, idx, this.drag, (from, to) => void this.reorder(from, to));

			const nameInput = card.createEl('input', {
				cls: 'hoard-modal-input hoard-editcol-card-name',
				attr: { type: 'text', placeholder: 'Field name' },
			});
			nameInput.value = col.name;
			nameInput.addEventListener('change', () => {
				const next = nameInput.value.trim();
				if (!next) {
					nameInput.value = col.name;
					return;
				}
				if (next === col.name) return;
				void this.updateColumn({ ...col, name: next });
			});

			const typeSelect = renderTypeSelect(card, col.type);

			const colorDot = card.createEl('button', { cls: 'hoard-reading-col-color-dot' });
			colorDot.style.backgroundColor = col.color ?? DEFAULT_FIELD_COLOR;
			colorDot.title = 'Choose field color';
			colorDot.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openColorPalette(colorDot, col);
			});

			const optsInput = card.createEl('input', {
				cls: 'hoard-modal-input hoard-reading-col-opts-input',
				attr: { type: 'text', placeholder: 'Comma-separated values' },
			});
			optsInput.value = col.options.join(', ');
			optsInput.style.visibility = col.type === 'select' ? '' : 'hidden';
			optsInput.addEventListener('change', () => {
				const parsed = optsInput.value
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				void this.updateColumn({ ...col, options: parsed });
			});

			typeSelect.addEventListener('change', () => {
				const type = typeSelect.value as ReadingCustomColumn['type'];
				optsInput.style.visibility = type === 'select' ? '' : 'hidden';
				void this.updateColumn({ ...col, type });
			});

			const delBtn = card.createEl('button', {
				cls: 'hoard-btn hoard-btn-sm hoard-editcol-card-del',
				text: '✕',
			});
			delBtn.title = 'Delete this field';
			delBtn.addEventListener('click', () => {
				new ConfirmModal(
					this.plugin.app,
					`Delete field "${col.name}"? This removes its data from every ${
						this.kind === 'book' ? 'book' : 'manga'
					} entry.`,
					() => void this.deleteColumn(col.id),
				).open();
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
		const wrap = parent.createDiv({ cls: 'hoard-reading-add-col' });
		wrap.createDiv({ cls: 'hoard-reading-section-label', text: 'Add field' });

		const row = wrap.createDiv({ cls: 'hoard-reading-add-col-row' });

		const nameInput = row.createEl('input', {
			cls: 'hoard-modal-input hoard-reading-add-col-name',
			attr: { type: 'text', placeholder: 'Field name' },
		});

		const typeSelect = row.createEl('select', { cls: 'hoard-select hoard-reading-add-col-type' });
		for (const t of ['text', 'number', 'select'] as const) {
			typeSelect.createEl('option', {
				value: t,
				text: t.charAt(0).toUpperCase() + t.slice(1),
			});
		}

		const optsInput = row.createEl('input', {
			cls: 'hoard-modal-input hoard-reading-add-col-opts',
			attr: {
				type: 'text',
				placeholder: 'Options (comma-separated)',
			},
		});
		const refreshOpts = (): void => {
			optsInput.style.display = typeSelect.value === 'select' ? '' : 'none';
		};
		typeSelect.addEventListener('change', refreshOpts);
		refreshOpts();

		const addBtn = row.createEl('button', {
			cls: 'hoard-reading-add-btn hoard-btn-success hoard-reading-add-col-btn',
			text: 'Add',
		});
		addBtn.addEventListener('click', () => {
			const name = nameInput.value.trim();
			if (!name) {
				new Notice('Enter a field name first.');
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
				id: this.readingData.generateColumnId(this.kind, name),
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
		await this.readingData.addColumn(this.kind, col);
		this.renderList();
		this.onChanged();
	}

	private async updateColumn(col: ReadingCustomColumn): Promise<void> {
		await this.readingData.updateColumn(this.kind, col);
		this.renderList();
		this.onChanged();
	}

	private async deleteColumn(id: string): Promise<void> {
		await this.readingData.removeColumn(this.kind, id);
		this.renderList();
		this.onChanged();
	}

	private async reorder(from: number, to: number): Promise<void> {
		await this.readingData.reorderColumns(this.kind, from, to);
		this.renderList();
		this.onChanged();
	}
}
