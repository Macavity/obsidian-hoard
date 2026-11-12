import { App, Notice, setIcon, setTooltip } from 'obsidian';
import type { CustomListColumn, CustomListRow } from '../types';
import { DEFAULT_FIELD_COLOR } from '../types';
import { ConfirmModal } from '../ConfirmModal';
import { t } from '../i18n';
import { createIconButton } from './IconButton';
import { openColorPicker, deriveFillColor, deriveBorderColor } from '../ColorPicker';

/**
 * Aligns a column's option-colour map with its trimmed options on save: drops colours for
 * removed options, clears the map for non-select columns.
 */
function normalizeOptionColors(col: CustomListColumn): void {
	if (col.type !== 'select') { delete col.optionColors; return; }
	if (!col.optionColors) return;
	const opts = new Set(col.options ?? []);
	const cleaned: Record<string, string> = {};
	for (const [k, v] of Object.entries(col.optionColors)) {
		const tk = k.trim();
		if (opts.has(tk)) cleaned[tk] = v;
	}
	if (Object.keys(cleaned).length) col.optionColors = cleaned;
	else delete col.optionColors;
}

/** Shared drag state of one card list: index of the card being dragged, -1 when none. */
export interface DragState { from: number }

/** Adds the drag handle and the drag-and-drop listeners to a column card. */
/** Toggle state for format buttons: the class drives the look, aria-pressed the meaning. */
function setPressed(btn: HTMLElement, on: boolean): void {
	btn.toggleClass('is-active', on);
	btn.setAttr('aria-pressed', String(on));
}

export function attachCardDrag(
	card: HTMLElement,
	idx: number,
	drag: DragState,
	onReorder: (from: number, to: number) => void,
): void {
	// drag-only grip, deliberately not a focusable button
	const handle = card.createDiv({ cls: 'hoard-edit-columns__card-handle' });
	setIcon(handle, 'grip-vertical');
	handle.title = t('ui.columns.dragToReorder');
	handle.addEventListener('mousedown', () => card.setAttribute('draggable', 'true'));
	card.addEventListener('dragstart', (e) => {
		drag.from = idx;
		e.dataTransfer?.setData('text/plain', String(idx));
		card.addClass('hoard-custom-lists__dragging');
	});
	card.addEventListener('dragend', () => {
		card.removeClass('hoard-custom-lists__dragging');
		card.setAttribute('draggable', 'false');
	});
	card.addEventListener('dragover', (e) => { e.preventDefault(); card.addClass('hoard-custom-lists__drag-over'); });
	card.addEventListener('dragleave', () => card.removeClass('hoard-custom-lists__drag-over'));
	card.addEventListener('drop', (e) => {
		e.preventDefault();
		card.removeClass('hoard-custom-lists__drag-over');
		const from = drag.from;
		drag.from = -1;
		if (from !== idx && from >= 0) onReorder(from, idx);
	});
}

/** Text / number / select dropdown of a column card. */
export function renderTypeSelect(card: HTMLElement, current: CustomListColumn['type']): HTMLSelectElement {
	const typeSelect = card.createEl('select', { cls: 'hoard-input__select hoard-edit-columns__card-type' });
	const labels = {
		text: t('ui.columns.typeText'),
		number: t('ui.columns.typeNumber'),
		select: t('ui.columns.typeSelect'),
	};
	for (const type of ['text', 'number', 'select'] as const) {
		const opt = typeSelect.createEl('option', { value: type, text: labels[type] });
		if (current === type) opt.selected = true;
	}
	return typeSelect;
}

/** Deep copy of columns (options and option colours are not shared with the source). */
export function cloneColumns(cols: CustomListColumn[]): CustomListColumn[] {
	return cols.map(c => ({
		...c,
		options: c.options ? [...c.options] : undefined,
		optionColors: c.optionColors ? { ...c.optionColors } : undefined,
	}));
}

/** Moves the column at `from` to the drop slot `to` (slot index before removal). */
export function moveColumn(cols: CustomListColumn[], from: number, to: number): void {
	const [moved] = cols.splice(from, 1);
	if (moved) cols.splice(from < to ? to - 1 : to, 0, moved);
}

export type ColumnsProblem = { reason: 'emptyName' } | { reason: 'noOptions'; label: string };

/** First validation problem of a column set, or null when it can be saved. */
export function validateColumns(cols: CustomListColumn[]): ColumnsProblem | null {
	for (const col of cols) {
		if (!col.label.trim()) return { reason: 'emptyName' };
		if (col.type === 'select' && (!col.options || col.options.length === 0)) {
			return { reason: 'noOptions', label: col.label };
		}
	}
	return null;
}

/** Localized text of a column problem. */
export function columnsProblemText(problem: ColumnsProblem): string {
	return problem.reason === 'emptyName'
		? t('ui.columns.emptyName')
		: t('ui.columns.noOptions', { label: problem.label });
}

/** Trims labels and options and aligns option colours; mutates the columns. */
export function normalizeColumns(cols: CustomListColumn[]): void {
	for (const col of cols) {
		col.label = col.label.trim();
		if (col.options) col.options = col.options.map(o => o.trim()).filter(o => o);
		normalizeOptionColors(col);
	}
}

export interface ColumnsEditorOptions {
	app: App;
	/** Existing rows: used to derive select options and to warn before deleting a column with data. */
	rows: CustomListRow[];
	/** Renders content above the column list. */
	renderHeader: (parent: HTMLElement) => void;
	/** Id for a freshly added column, given the current editable columns. */
	newColumnId: (cols: CustomListColumn[]) => string;
	onOptionRename?: (colId: string, oldVal: string, newVal: string) => void;
	/** Called with the validated, normalized columns. */
	onSave: (cols: CustomListColumn[]) => void;
	onCancel: () => void;
}

/** Renders the column editor (header, card list, Cancel/Save footer) into `host`. */
export function renderColumnsEditor(
	host: HTMLElement,
	state: { cols: CustomListColumn[] },
	opts: ColumnsEditorOptions,
): void {
	host.empty();
	host.addClass('hoard-edit-columns');
	opts.renderHeader(host);

	const listEl = host.createDiv({ cls: 'hoard-edit-columns__list' });
	const rerenderAll = (): void => renderColumnsEditor(host, state, opts);
	const renderCols = (): void => {
		renderColumnList(
			listEl,
			state.cols,
			opts.rows,
			opts.app,
			(from, to) => { moveColumn(state.cols, from, to); renderCols(); },
			(idx) => { state.cols.splice(idx, 1); rerenderAll(); },
			rerenderAll,
			() => {
				state.cols.push({
					id: opts.newColumnId(state.cols),
					label: '',
					type: 'text',
					bold: false,
					italic: false,
				});
				rerenderAll();
			},
			opts.onOptionRename,
		);
	};
	renderCols();

	renderCancelSave(host.createDiv({ cls: 'hoard-modal__btn-row hoard-edit-columns__footer' }), {
		onCancel: opts.onCancel,
		onSave: () => {
			const problem = validateColumns(state.cols);
			if (problem) { new Notice(columnsProblemText(problem)); return; }
			normalizeColumns(state.cols);
			opts.onSave(state.cols);
		},
	});
}

/** Cancel / Save button pair shared by the modals' footers. */
export function renderCancelSave(
	row: HTMLElement,
	handlers: { onCancel: () => void; onSave: () => void },
): void {
	row.createEl('button', { cls: 'hoard-btn', text: t('common.cancel') }).addEventListener('click', () => handlers.onCancel());
	row.createEl('button', { cls: 'hoard-btn hoard-btn--primary', text: t('common.save') }).addEventListener('click', () => handlers.onSave());
}

// Shared column list renderer (used by renderColumnsEditor)

function renderColumnList(
	listEl: HTMLElement,
	cols: CustomListColumn[],
	existingRows: CustomListRow[],
	app: App,
	onReorder: (from: number, to: number) => void,
	onDelete: (idx: number) => void,
	onTypeChange: () => void,
	onAdd?: () => void,
	onOptionRename?: (colId: string, oldVal: string, newVal: string) => void,
): void {
	listEl.empty();
	listEl.addClass('hoard-edit-columns__card-grid');
	const drag: DragState = { from: -1 };

	// permanent auto-included columns — non-editable, non-deletable, non-draggable
	const renderAutoCard = (id: string, label: string): void => {
		const card = listEl.createDiv({ cls: 'hoard-edit-columns__card hoard-edit-columns__card--auto' });
		card.setAttribute('data-auto', id);
		const nameWrap = card.createDiv({ cls: 'hoard-edit-columns__card-name-wrap' });
		nameWrap.createDiv({ cls: 'hoard-edit-columns__card-name-label', text: label });
		card.createDiv({ cls: 'hoard-edit-columns__card-type-locked', text: t('ui.columns.auto') });
		card.createDiv({ cls: 'hoard-edit-columns__card-spacer' });
	};
	renderAutoCard('#', '#');
	renderAutoCard('Name', t('ui.columns.autoName'));

	cols.forEach((col, idx) => {
		const card = listEl.createDiv({ cls: 'hoard-edit-columns__card' });

		attachCardDrag(card, idx, drag, onReorder);

		const nameInput = card.createEl('input', {
			cls: 'hoard-modal__input hoard-edit-columns__card-name',
			attr: { type: 'text', placeholder: t('ui.columns.columnName'), value: col.label },
		});
		nameInput.addEventListener('input', () => { col.label = nameInput.value; });

		const typeSelect = renderTypeSelect(card, col.type);
		typeSelect.addEventListener('change', () => {
			const newType = typeSelect.value as CustomListColumn['type'];
			if (newType === 'select') {
				// rebuild the option list from the distinct non-empty values already in this column's cells, in
				// order of first appearance. Replaces any stored options (so stale ones don't resurrect) and
				// leaves the cell values untouched.
				const seen = new Set<string>();
				const derived: string[] = [];
				for (const row of existingRows) {
					const raw = (row as Record<string, unknown>)[col.id];
					if (typeof raw !== 'string' && typeof raw !== 'number') continue;
					const val = String(raw).trim();
					if (!val || seen.has(val)) continue;
					seen.add(val);
					derived.push(val);
				}
				col.options = derived;
			}
			col.type = newType;
			onTypeChange();
		});

		if (col.type === 'text' || col.type === 'number') {
			const toggles = card.createDiv({ cls: 'hoard-edit-columns__card-toggles' });
			const boldBtn = toggles.createEl('button', {
				cls: 'hoard-btn hoard-btn--sm hoard-edit-columns__card-toggle hoard-edit-columns__bold-btn',
				text: t('ui.columns.bold'),
			});
			setPressed(boldBtn, !!col.bold);
			boldBtn.addEventListener('click', () => {
				col.bold = !col.bold;
				setPressed(boldBtn, !!col.bold);
			});
			const italicBtn = toggles.createEl('button', {
				cls: 'hoard-btn hoard-btn--sm hoard-edit-columns__card-toggle hoard-edit-columns__italic-btn',
				text: t('ui.columns.italic'),
			});
			setPressed(italicBtn, !!col.italic);
			italicBtn.addEventListener('click', () => {
				col.italic = !col.italic;
				setPressed(italicBtn, !!col.italic);
			});

			if (col.type === 'number') {
				const autoTimeBtn = toggles.createEl('button', {
					cls: 'hoard-btn hoard-btn--sm hoard-edit-columns__card-toggle hoard-edit-columns__autotime-btn',
					attr: { 'aria-label': t('ui.columns.autoTime') },
				});
				setTooltip(autoTimeBtn, t('ui.columns.autoTime'));
				setIcon(autoTimeBtn, 'timer');
				setPressed(autoTimeBtn, !!col.autoTime);
				autoTimeBtn.addEventListener('click', () => {
					col.autoTime = !col.autoTime;
					setPressed(autoTimeBtn, !!col.autoTime);
				});
			}
		}

		const delBtn = createIconButton(card, { icon: 'x', label: t('ui.columns.deleteColumn'), cls: 'hoard-edit-columns__card-delete' });
		delBtn.addEventListener('click', () => {
			const hasData = existingRows.some(r => {
				const val = (r as Record<string, unknown>)[col.id];
				return val !== undefined && val !== '' && val !== null;
			});
			if (hasData) {
				new ConfirmModal(app, t('ui.columns.deleteConfirm', { label: col.label }), () => {
					onDelete(idx);
				}).open();
			} else {
				onDelete(idx);
			}
		});

		if (col.type === 'select') {
			const optsArea = card.createDiv({ cls: 'hoard-edit-columns__card-options' });
			const renderOpts = (): void => {
				optsArea.empty();
				(col.options ?? []).forEach((opt, oi) => {
					const optRow = optsArea.createDiv({ cls: 'hoard-edit-columns__card-option-row' });

					// per-option colour dot — reuses the shared picker + derivation helpers
					const colorDot = optRow.createEl('button', {
						cls: 'hoard-color-picker__dot hoard-edit-columns__option-color-dot',
					});
					colorDot.title = t('ui.columns.optionColor');
					const syncDot = (): void => {
						const c = col.optionColors?.[col.options?.[oi] ?? ''];
						if (c) {
							colorDot.removeClass('is-unset');
							// colours flow through CSS vars; .is-unset gates whether they apply
							colorDot.setCssProps({ '--hoard-color-picker-dot-fill': deriveFillColor(c), '--hoard-color-picker-dot-border': deriveBorderColor(c) });
						} else {
							colorDot.addClass('is-unset');
						}
					};
					syncDot();
					colorDot.addEventListener('click', (e) => {
						e.stopPropagation();
						const key = col.options?.[oi] ?? '';
						if (!key) return; // can't colour a blank option
						openColorPicker({
							anchor: colorDot,
							container: listEl,
							current: col.optionColors?.[key] ?? DEFAULT_FIELD_COLOR,
							allowCustom: true,
							onPick: (color) => {
								if (color === null) {
									if (col.optionColors) delete col.optionColors[key];
								} else {
									if (!col.optionColors) col.optionColors = {};
									col.optionColors[key] = color;
								}
								syncDot();
							},
						});
					});

					const optInput = optRow.createEl('input', {
						cls: 'hoard-modal__input hoard-edit-columns__card-option-input',
						attr: { type: 'text', value: opt, placeholder: t('ui.columns.optionPlaceholder') },
					});
					let prevVal = opt;
					optInput.addEventListener('input', () => {
						if (!col.options) col.options = [];
						const nextVal = optInput.value;
						if (nextVal !== prevVal) {
							// keep any assigned colour attached to the renamed value
							if (col.optionColors) {
								const moved = col.optionColors[prevVal];
								if (moved !== undefined) {
									if (nextVal) col.optionColors[nextVal] = moved;
									delete col.optionColors[prevVal];
								}
							}
							// record the rename so row cells can be migrated at save time
							onOptionRename?.(col.id, prevVal, nextVal);
						}
						col.options[oi] = nextVal;
						prevVal = nextVal;
					});
					const delOpt = createIconButton(optRow, {
						icon: 'x',
						label: t('ui.columns.removeOption'),
						cls: 'hoard-edit-columns__card-option-delete',
						variant: 'sm',
					});
					delOpt.addEventListener('click', () => {
						const key = col.options?.[oi];
						col.options?.splice(oi, 1);
						if (key && col.optionColors) delete col.optionColors[key];
						renderOpts();
					});
				});
				const addOpt = optsArea.createEl('button', {
					cls: 'hoard-btn hoard-btn--sm hoard-edit-columns__card-option-add',
					text: t('ui.columns.addOption'),
				});
				addOpt.addEventListener('click', () => {
					if (!col.options) col.options = [];
					col.options.push('');
					renderOpts();
				});
			};
			renderOpts();
		}
	});

	if (onAdd) {
		const addCard = listEl.createDiv({ cls: 'hoard-edit-columns__card hoard-edit-columns__card--add' });
		addCard.createDiv({ cls: 'hoard-edit-columns__card-add-label', text: t('ui.columns.addColumn') });
		addCard.addEventListener('click', () => onAdd());
	}
}
