import { App, Component, MarkdownRenderer, Modal, Notice, Platform, TFile, normalizePath, Setting, type EventRef, type TAbstractFile } from 'obsidian';
import type HoardPlugin from './main';
import type { DataManager } from './DataManager';
import type { CustomListColumn, CustomListRow, CustomList } from './types';
import { DEFAULT_FIELD_COLOR } from './types';
import { ConfirmModal } from './ConfirmModal';
import { openColorPicker, deriveFillColor, deriveBorderColor } from './ColorPicker';
import { openStatusDropdown } from './StatusDropdown';
import { openAddForTitle } from './AddRouter';
import { cloneColumns, renderCancelSave, renderColumnsEditor } from './ui/ColumnsEditor';
import { t } from './i18n';
import { createIconButton } from './ui/IconButton';
import { statusLabel, typeLabel, readingStatusLabel } from './i18n/labels';

/** Row name, trimmed — the index signature types it loosely. */
function rowName(row: CustomListRow): string {
	return String((row as Record<string, string | undefined>)['name'] ?? '').trim();
}

/** Key handling of an inline cell editor: Tab / Shift+Tab / Enter commit and navigate, Escape cancels. */
function handleEditKey(
	e: KeyboardEvent,
	commit: (nav: CellNavDirection) => void,
	cancel: () => void,
): void {
	if (e.key === 'Tab') { e.preventDefault(); commit(e.shiftKey ? 'shift-tab' : 'tab'); }
	else if (e.key === 'Enter') { e.preventDefault(); commit('enter'); }
	else if (e.key === 'Escape') {
		e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
		if (!e.isComposing) cancel(); // during IME composition Escape only aborts the composition
	}
}

export type CellNavDirection = 'tab' | 'shift-tab' | 'enter';

/** Where an inline-edit commit moves next: a cell (`same` row or a row index), a new row with the
 *  given column focused, or nowhere (Shift+Tab on the very first cell). */
export type CellNavTarget = { row: 'same' | number; col: number | 'last' } | { addRow: number } | null;

/** Spreadsheet-style navigation: Tab walks right then wraps to the next row, Shift+Tab walks back,
 *  Enter goes down the same column; leaving the last row appends one. */
export function cellNavTarget(
	direction: CellNavDirection,
	rowIdx: number,
	colIdx: number,
	rowCount: number,
	cellCount: number,
): CellNavTarget {
	const hasNextRow = rowIdx >= 0 && rowIdx < rowCount - 1;
	if (direction === 'shift-tab') {
		if (colIdx > 0) return { row: 'same', col: colIdx - 1 };
		return rowIdx > 0 ? { row: rowIdx - 1, col: 'last' } : null;
	}
	if (direction === 'tab') {
		if (colIdx >= 0 && colIdx < cellCount - 1) return { row: 'same', col: colIdx + 1 };
		return hasNextRow ? { row: rowIdx + 1, col: 0 } : { addRow: 0 };
	}
	const col = Math.max(colIdx, 0);
	return hasNextRow ? { row: rowIdx + 1, col } : { addRow: col };
}

/** Minimum width (px) a resizable column can be dragged to. */
const MIN_COL_WIDTH = 60;
/** Fallback width (px) for a resizable column with no explicit width. */
const DEFAULT_COL_WIDTH = 140;

// CustomListManager — vault I/O

const DATA_BLOCK = /## Data\n```json\n[\s\S]*?\n```/;

/** Replaces the `## Data` JSON block, or appends one; everything else in the note is kept. */
function replaceDataBlock(content: string, json: string): string {
	const block = `## Data\n\`\`\`json\n${json}\n\`\`\``;
	if (DATA_BLOCK.test(content)) return content.replace(DATA_BLOCK, () => block);
	return `${content.replace(/\n*$/, '')}\n\n${block}\n`;
}

/** Replaces the body of `## Notes` up to `## Data`; a note without `## Notes` gets one before `## Data`. */
function replaceNotes(content: string, notes: string): string {
	const notesMarker = '## Notes\n';
	const notesIdx = content.indexOf(notesMarker);
	if (notesIdx === -1) {
		const section = `${notesMarker}${notes}\n\n`;
		const dataIdx = content.indexOf('## Data\n');
		return dataIdx !== -1
			? content.slice(0, dataIdx) + section + content.slice(dataIdx)
			: `${content.replace(/\n*$/, '')}\n\n${section}`;
	}
	const afterNotes = notesIdx + notesMarker.length;
	const dataIdx = content.indexOf('\n## Data\n', afterNotes);
	return dataIdx !== -1
		? content.slice(0, afterNotes) + notes + content.slice(dataIdx)
		: content.slice(0, afterNotes) + notes + '\n';
}

export class CustomListManager {
	/** Names of lists whose ## Data JSON is corrupt — never overwrite these. */
	corruptLists: Set<string> = new Set();

	/**
	 * Per-list save queue: serializes writes to the same file so table and notes saves can't race
	 * and clobber each other.
	 */
	private saveQueues: Map<string, Promise<boolean>> = new Map();

	/**
	 * Stored state (data JSON + notes) each in-memory list was loaded from or last written as.
	 * A write goes through only while the note still holds that state; anything else is a foreign
	 * change (sync, hand edit, delete) that a stale copy must not overwrite.
	 */
	private baselines = new WeakMap<CustomList, string>();

	constructor(
		private readonly app: App,
		private readonly plugin: HoardPlugin,
		/** Called when a write was refused because the note changed elsewhere. */
		private readonly onConflict: (list: CustomList) => void = () => {},
	) {}

	private async saveSerialized(listName: string, saveFn: () => Promise<boolean>): Promise<boolean> {
		const prev = this.saveQueues.get(listName) ?? Promise.resolve(true);
		const next = prev.then(saveFn).catch((e: unknown) => {
			console.error('[Hoard] Save error for list:', listName, e);
			return false;
		});
		this.saveQueues.set(listName, next);
		return next;
	}

	private pathOf(name: string): string {
		return normalizePath(`${this.folderPath}/${name}.md`);
	}

	private stateKey(list: CustomList): string {
		return `${this.dataJson(list)}\n${list.notes}`;
	}

	private dataJson(list: CustomList): string {
		return JSON.stringify(
			{ columns: list.columns, rows: list.rows, tabColor: list.tabColor, nameWidth: list.nameWidth },
			null,
			2,
		);
	}

	/**
	 * True when the note holds a different valid state than the one `list` was made from. A note that
	 * does not parse is not stale: it is most likely mid-edit, and a save refuses it anyway.
	 */
	async isStale(list: CustomList): Promise<boolean> {
		const disk = await this.peek(list.name);
		if (disk === undefined) return this.baselines.has(list);
		return disk !== null && this.stateKey(disk) !== this.baselines.get(list);
	}

	/** The note's list without reporting corruption: undefined without a file, null if it does not parse. */
	async peek(name: string): Promise<CustomList | null | undefined> {
		const file = this.app.vault.getAbstractFileByPath(this.pathOf(name));
		if (!(file instanceof TFile)) return undefined;
		return this.parse(name, await this.app.vault.read(file), false);
	}

	/**
	 * Rewrites the note through `transform` only if it still holds the baseline of `list`;
	 * returns false (note untouched) on a foreign change.
	 */
	private async writeChecked(list: CustomList, file: TFile, transform: (data: string) => string): Promise<boolean> {
		let written = false;
		await this.app.vault.process(file, (data) => {
			const disk = this.parse(list.name, data, false);
			if (!disk || this.stateKey(disk) !== this.baselines.get(list)) return data;
			const next = transform(data);
			const after = this.parse(list.name, next);
			if (after) this.baselines.set(list, this.stateKey(after));
			written = true;
			return next;
		});
		if (!written) this.onConflict(list);
		return written;
	}

	get folderPath(): string {
		return this.plugin.getLayout().customListsFolder;
	}

	async ensureFolder(): Promise<void> {
		const path = normalizePath(this.folderPath);
		if (!this.app.vault.getAbstractFileByPath(path)) {
			try { await this.app.vault.createFolder(path); } catch { /* ok */ }
		}
	}

	listNames(): string[] {
		const dir = normalizePath(this.folderPath);
		return this.app.vault.getFiles()
			.filter(f => {
				const parentPath = f.parent?.path ?? '';
				return parentPath === dir && f.extension === 'md';
			})
			.map(f => f.basename)
			.sort((a, b) => a.localeCompare(b));
	}

	async loadList(name: string): Promise<CustomList | null> {
		const path = normalizePath(`${this.folderPath}/${name}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		try {
			const list = this.parse(name, await this.app.vault.read(file));
			if (list) {
				this.corruptLists.delete(name);
				this.baselines.set(list, this.stateKey(list));
			}
			return list;
		} catch (e) {
			console.warn('[Hoard] Failed to read custom list', name, e);
			return null;
		}
	}

	/**
	 * Reads each named list into a `name → tabColor` map for tab rendering. Lists without a colour,
	 * or that fail to load, are omitted.
	 */
	async loadTabColors(names: string[]): Promise<Map<string, string>> {
		const out = new Map<string, string>();
		await Promise.all(names.map(async (name) => {
			const list = await this.loadList(name);
			if (list?.tabColor) out.set(name, list.tabColor);
		}));
		return out;
	}

	/**
	 * `report` marks a corrupt list and tells the user; the foreign-edit guard passes false, since a
	 * note being hand-edited is invalid JSON between two keystrokes and only counts as changed.
	 */
	private parse(name: string, content: string, report = true): CustomList | null {
		const notesMatch = content.match(/## Notes\n([\s\S]*?)(?=\n## |\s*$)/);
		const notes = (notesMatch?.[1] ?? '').trim();

		const dataMatch = content.match(/## Data\n```json\n([\s\S]*?)\n```/);
		let columns: CustomListColumn[] = [];
		let rows: CustomListRow[] = [];
		let tabColor: string | undefined;
		let nameWidth: number | undefined;

		if (dataMatch?.[1]) {
			try {
				const p = JSON.parse(dataMatch[1]) as { columns?: unknown; rows?: unknown; tabColor?: unknown; nameWidth?: unknown };
				if (typeof p.tabColor === 'string') tabColor = p.tabColor;
				if (typeof p.nameWidth === 'number') nameWidth = p.nameWidth;
				if (Array.isArray(p.columns)) {
					columns = (p.columns as unknown[]).filter((c): c is CustomListColumn =>
						typeof c === 'object' && c !== null &&
						'id' in c && 'label' in c && 'type' in c,
					);
				}
				if (Array.isArray(p.rows)) {
					rows = (p.rows as unknown[]).filter((r): r is CustomListRow =>
						typeof r === 'object' && r !== null && 'id' in r,
					);
				}
			} catch (e) {
				if (!report) return null;
				console.warn('[Hoard] Custom list JSON parse failed for', name, e);
				new Notice(t('lists.corrupt', { name }));
				this.corruptLists.add(name);
				return null;
			}
		}

		return { name, columns, rows, notes, tabColor, nameWidth };
	}

	/**
	 * Writes the table (the `## Data` block) of `list`; the rest of the note stays as it is on disk.
	 * Returns false when nothing was written: corrupt list, or the note changed (or vanished)
	 * since `list` was loaded.
	 */
	async saveList(list: CustomList): Promise<boolean> {
		return this.saveSerialized(list.name, async () => {
			if (this.corruptLists.has(list.name)) {
				console.warn('[Hoard] Refusing to save corrupt custom list', list.name);
				return false;
			}
			await this.ensureFolder();
			const path = this.pathOf(list.name);
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				return this.writeChecked(list, existing, (data) => replaceDataBlock(data, this.dataJson(list)));
			}
			if (this.baselines.has(list)) {
				// deleted or renamed elsewhere: recreating it would undo that
				this.onConflict(list);
				return false;
			}
			const content = this.serialize(list);
			await this.app.vault.create(path, content);
			const created = this.parse(list.name, content);
			if (created) this.baselines.set(list, this.stateKey(created));
			return true;
		});
	}

	/** Saves only the ## Notes section, without touching ## Data JSON. */
	async saveNotes(list: CustomList, notes: string): Promise<boolean> {
		return this.saveSerialized(list.name, async () => {
			const file = this.app.vault.getAbstractFileByPath(this.pathOf(list.name));
			if (!(file instanceof TFile)) {
				this.onConflict(list); // deleted or renamed elsewhere
				return false;
			}
			const written = await this.writeChecked(list, file, (data) => replaceNotes(data, notes));
			if (written) list.notes = notes;
			return written;
		});
	}

	private serialize(list: CustomList): string {
		const json = this.dataJson(list);
		return `# ${list.name}\n\n## Notes\n${list.notes}\n\n## Data\n\`\`\`json\n${json}\n\`\`\`\n`;
	}

	async deleteList(name: string): Promise<void> {
		const path = normalizePath(`${this.folderPath}/${name}.md`);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			try { await this.app.fileManager.trashFile(file); } catch { /* ok */ }
		}
	}

	async renameList(oldName: string, newName: string): Promise<void> {
		const newPath = normalizePath(`${this.folderPath}/${newName}.md`);
		const oldPath = normalizePath(`${this.folderPath}/${oldName}.md`);
		const file = this.app.vault.getAbstractFileByPath(oldPath);
		if (file instanceof TFile) {
			try { await this.app.vault.rename(file, newPath); } catch { /* ok */ }
		}
	}

	generateColId(existingColumns: CustomListColumn[]): string {
		const ids = new Set(existingColumns.map(c => c.id));
		let i = 1;
		while (ids.has(`col_${i}`)) i++;
		return `col_${i}`;
	}

	generateRowId(rows: CustomListRow[]): string {
		const ids = new Set(rows.map(r => r.id));
		let i = 1;
		while (ids.has(`row_${i}`)) i++;
		return `row_${i}`;
	}
}

// EditColumnsModal

class EditColumnsModal extends Modal {
	private list: CustomList;
	private manager: CustomListManager;
	private onSave: (columns: CustomListColumn[]) => Promise<void>;
	private cols: CustomListColumn[];
	private tabColor: string | undefined;
	// colId → (original option value → latest value). Applied to row cells on Save only — never live,
	// so a Cancel can't leak a rename into a later cell-edit save.
	private optionRenames: Map<string, Map<string, string>> = new Map();

	constructor(
		app: App,
		list: CustomList,
		manager: CustomListManager,
		onSave: (columns: CustomListColumn[]) => Promise<void>,
	) {
		super(app);
		this.list = list;
		this.manager = manager;
		this.onSave = onSave;
		this.tabColor = list.tabColor;
		this.cols = cloneColumns(list.columns.filter(c => !c.locked));
	}

	onOpen(): void {
		this.modalEl.addClass('hoard-editcol-modal');
		this.titleEl.setText(t('lists.tableSettingsTitle', { name: this.list.name }));
		this.contentEl.addClass('hoard-editcols-modal');
		this.renderBody();
	}

	private renderBody(): void {
		renderColumnsEditor(this.contentEl, { cols: this.cols }, {
			app: this.app,
			rows: this.list.rows,
			renderHeader: (parent) => this.renderTabColorRow(parent),
			newColumnId: (cols) => this.manager.generateColId([...this.list.columns.filter(c => !c.locked), ...cols]),
			onOptionRename: (colId, oldVal, newVal) => this.recordOptionRename(colId, oldVal, newVal),
			onSave: (cols) => this.handleSave(cols),
			onCancel: () => this.close(),
		});
	}

	private renderTabColorRow(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'hoard-editcols-tabcolor-row' });
		row.createSpan({ cls: 'hoard-editcols-tabcolor-label', text: t('lists.tabColor') });

		const dot = row.createEl('button', { cls: 'hoard-reading-col-color-dot hoard-editcols-tabcolor-dot' });

		const sync = (): void => {
			if (this.tabColor) {
				dot.removeClass('is-unset');
				// colour flows through a CSS var; .is-unset gates whether it applies
				dot.setCssProps({ '--hoard-dot-fill': this.tabColor });
			} else {
				dot.addClass('is-unset');
			}
		};
		sync();

		dot.title = t('lists.chooseTabColor');
		dot.addEventListener('click', (e) => {
			e.stopPropagation();
			openColorPicker({
				anchor: dot,
				container: this.contentEl,
				current: this.tabColor ?? DEFAULT_FIELD_COLOR,
				allowCustom: true,
				// clear swatch → null → revert to the default (uncoloured) tab name
				onPick: (color) => { this.tabColor = color ?? undefined; sync(); },
			});
		});
	}

	/**
	 * Accumulates a net (original → latest) rename per option, composing keystrokes so
	 * "A"→"Ap"→"Apple" collapses to "A"→"Apple".
	 */
	private recordOptionRename(colId: string, oldVal: string, newVal: string): void {
		let m = this.optionRenames.get(colId);
		if (!m) { m = new Map(); this.optionRenames.set(colId, m); }
		// if some original already maps to oldVal, extend that chain; else start fresh
		let origKey: string | null = null;
		for (const [orig, cur] of m) { if (cur === oldVal) { origKey = orig; break; } }
		m.set(origKey ?? oldVal, newVal);
	}

	/**
	 * Migrates row cells from each original option value to its final value. Only exact matches in
	 * the renamed column are touched; orphan values that were never an option, and options created
	 * fresh this session (orig ''), are left alone.
	 */
	private applyOptionRenamesToRows(): void {
		for (const [colId, m] of this.optionRenames) {
			for (const [orig, final] of m) {
				if (orig === '' || orig === final) continue;
				for (const r of this.list.rows) {
					if ((r as Record<string, unknown>)[colId] === orig) {
						(r as Record<string, unknown>)[colId] = final;
					}
				}
			}
		}
	}

	private handleSave(cols: CustomListColumn[]): void {
		this.applyOptionRenamesToRows();
		this.list.tabColor = this.tabColor;
		void this.onSave(cols).then(() => this.close());
	}
}

// DefaultColumnsModal — for Settings

export class DefaultColumnsModal extends Modal {
	private plugin: HoardPlugin;
	private cols: CustomListColumn[];
	private manager: CustomListManager;

	constructor(app: App, plugin: HoardPlugin) {
		super(app);
		this.plugin = plugin;
		this.manager = new CustomListManager(app, plugin);
		this.cols = cloneColumns(plugin.settings.defaultCustomColumns ?? []);
	}

	onOpen(): void {
		this.modalEl.addClass('hoard-editcol-modal');
		this.titleEl.setText(t('lists.defaultColumns'));
		this.contentEl.addClass('hoard-editcols-modal');
		this.renderBody();
	}

	private renderBody(): void {
		renderColumnsEditor(this.contentEl, { cols: this.cols }, {
			app: this.app,
			rows: [],
			renderHeader: (parent) => {
				parent.createDiv({
					cls: 'hoard-settings-info',
					text: t('lists.defaultColumnsInfo'),
				});
			},
			newColumnId: (cols) => this.manager.generateColId(cols),
			onSave: (cols) => void this.handleSave(cols),
			onCancel: () => this.close(),
		});
	}

	private async handleSave(cols: CustomListColumn[]): Promise<void> {
		this.plugin.settings.defaultCustomColumns = cols;
		await this.plugin.saveSettings();
		new Notice(t('lists.defaultColumnsSaved'));
		this.close();
	}
}

// NotesModal — edits a list's notes in a textarea

class NotesModal extends Modal {
	private previewComponent = new Component();

	constructor(
		app: App,
		private listName: string,
		private initialNotes: string,
		/** Resolves false when nothing was saved; the modal then stays open with the typed text. */
		private onSave: (notes: string) => Promise<boolean>,
	) { super(app); }

	onOpen(): void {
		this.previewComponent.load();
		this.titleEl.setText(t('lists.notesTitle', { name: this.listName }));
		const { contentEl } = this;
		contentEl.addClass('hoard-notes-modal');

		const modeBar = contentEl.createDiv({ cls: 'hoard-notes-mode-bar' });
		const editBtn = modeBar.createEl('button', { cls: 'hoard-btn hoard-btn-sm is-active', text: t('common.edit') });
		const previewBtn = modeBar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.preview') });

		const editArea = contentEl.createDiv({ cls: 'hoard-notes-edit-area' });
		const textarea = editArea.createEl('textarea', {
			cls: 'hoard-modal-textarea hoard-notes-textarea',
			attr: { placeholder: t('lists.notesPlaceholder') },
		});
		textarea.value = this.initialNotes;
		window.setTimeout(() => {
			textarea.focus();
			textarea.setSelectionRange(textarea.value.length, textarea.value.length);
		}, 0);

		const previewArea = contentEl.createDiv({ cls: 'hoard-notes-preview-area' });
		previewArea.hide();

		const showEdit = (): void => {
			editArea.show();
			previewArea.hide();
			editBtn.addClass('is-active');
			previewBtn.removeClass('is-active');
			textarea.focus();
		};

		const showPreview = async (): Promise<void> => {
			editArea.hide();
			previewArea.show();
			previewArea.empty();
			editBtn.removeClass('is-active');
			previewBtn.addClass('is-active');
			const source = textarea.value.trim() || '*No notes yet.*';
			await MarkdownRenderer.render(this.app, source, previewArea, '', this.previewComponent);
		};

		editBtn.addEventListener('click', showEdit);
		previewBtn.addEventListener('click', () => void showPreview());

		// Ctrl+B / Ctrl+I shortcuts in the textarea
		textarea.addEventListener('keydown', (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
				e.preventDefault();
				wrapSelection(textarea, '**', '**');
			} else if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
				e.preventDefault();
				wrapSelection(textarea, '*', '*');
			}
		});

		const footer = contentEl.createDiv({ cls: 'hoard-modal-btn-row' });
		renderCancelSave(footer, {
			onCancel: () => this.close(),
			onSave: () => void this.onSave(textarea.value).then((saved) => { if (saved) this.close(); }),
		});
	}

	onClose(): void { this.previewComponent.unload(); this.contentEl.empty(); }
}

/** Wraps the current selection in a textarea with a prefix/suffix pair. */
function wrapSelection(ta: HTMLTextAreaElement, before: string, after: string): void {
	const start = ta.selectionStart;
	const end = ta.selectionEnd;
	const selected = ta.value.slice(start, end);
	const replacement = before + selected + after;
	ta.setRangeText(replacement, start, end, 'select');
	// place the cursor inside the markers when nothing was selected
	if (start === end) {
		ta.selectionStart = start + before.length;
		ta.selectionEnd = start + before.length;
	}
}

// ListNameModal — text-input modal (window.prompt() is blocked in Electron)

class ListNameModal extends Modal {
	constructor(
		app: App,
		private existingNames: string[],
		private onSubmit: (name: string) => void,
	) { super(app); }

	onOpen(): void {
		this.titleEl.setText(t('lists.newList'));
		const { contentEl } = this;

		let value = '';
		const errorEl = contentEl.createDiv({ cls: 'hoard-cl-name-error' });
		errorEl.hide();

		new Setting(contentEl)
			.setName(t('lists.listName'))
			.addText((tx) => {
				tx.setPlaceholder(t('lists.listNamePlaceholder'))
					.onChange((v) => { value = v; errorEl.hide(); });
				window.setTimeout(() => tx.inputEl.focus(), 0);
				tx.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') { e.preventDefault(); submit(); }
				});
			});

		const submit = (): void => {
			const trimmed = value.trim();
			if (!trimmed) { errorEl.textContent = t('lists.enterName'); errorEl.show(); return; }
			if (this.existingNames.includes(trimmed)) {
				errorEl.textContent = t('lists.nameExists', { name: trimmed });
				errorEl.show();
				return;
			}
			this.close();
			this.onSubmit(trimmed);
		};

		const btnRow = contentEl.createDiv({ cls: 'hoard-modal-btn-row' });
		btnRow.createEl('button', { cls: 'hoard-btn', text: t('common.cancel') }).addEventListener('click', () => this.close());
		btnRow.createEl('button', { cls: 'hoard-btn hoard-btn-primary', text: t('lists.create') }).addEventListener('click', submit);
	}

	onClose(): void { this.contentEl.empty(); }
}

// CustomListsTab

export class CustomListsTab {
	private container: HTMLElement;
	private plugin: HoardPlugin;
	private dataManager: DataManager;
	private manager: CustomListManager;

	private listNames: string[] = [];
	activeListName: string | null = null;
	private currentList: CustomList | null = null;
	private sortCol: string | null = null;
	private sortDir: 'asc' | 'desc' = 'asc';
	searchQuery = '';
	private duplicatedRowIds: Set<string> = new Set();
	private _escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

	// cleanup for the inline editor's document / visualViewport listeners
	private activeCleanups: Array<() => void> = [];

	// generation counter guarding against stale renders
	private renderGeneration = 0;

	// per-list save queue preventing overlapping table + notes writes
	private saveQueues: Map<string, Promise<void>> = new Map();

	// kept for keyboard navigation (set at buildTable time)
	private _countEl: HTMLElement | null = null;
	private _tableContainer: HTMLElement | null = null;

	constructor(container: HTMLElement, plugin: HoardPlugin, dataManager: DataManager) {
		this.container = container;
		this.plugin = plugin;
		this.dataManager = dataManager;
		this.manager = new CustomListManager(plugin.app, plugin, (list) => this.onSaveConflict(list));
		this.modifyRef = plugin.app.vault.on('modify', (file) => void this.onVaultModify(file));
	}

	private modifyRef: EventRef | null;

	/** A save was refused because the note changed elsewhere: show the note as it is now. */
	private onSaveConflict(list: CustomList): void {
		new Notice(t('lists.changedElsewhere', { name: list.name }));
		if (list === this.currentList) void this.render();
	}

	/**
	 * Reloads the open list when its note changed elsewhere (sync, hand edit), or shows it again once a
	 * corrupt note parses. Own writes move the baseline first, so they are not stale. An open cell editor is left alone; its save then
	 * meets the changed baseline and reloads via `onSaveConflict`.
	 */
	private async onVaultModify(file: TAbstractFile): Promise<void> {
		const name = this.activeListName;
		if (!name || file.path !== normalizePath(`${this.manager.folderPath}/${name}.md`)) return;
		const list = this.currentList;
		// no list shown: the note was corrupt; show it once it parses again
		const reload = list ? await this.manager.isStale(list) : Boolean(await this.manager.peek(name));
		if (!reload || list !== this.currentList || this.container.querySelector('.hoard-cl-editing')) return;
		await this.render();
	}

	/** listNames merged with the persisted tab order (new lists appended at the end). */
	private applyTabOrder(names: string[]): string[] {
		const saved = this.plugin.settings.customListTabOrder ?? [];
		const ordered = saved.filter(n => names.includes(n));
		const unordered = names.filter(n => !ordered.includes(n));
		return [...ordered, ...unordered];
	}

	/** View close: stop listening to the vault and tear down the inline editor. */
	destroy(): void {
		if (this.modifyRef) this.plugin.app.vault.offref(this.modifyRef);
		this.modifyRef = null;
		this.teardownEditor();
	}

	/** Tear down active inline-editor listeners (on rerender / view close). */
	private teardownEditor(): void {
		for (const fn of this.activeCleanups) {
			try { fn(); } catch { /* ignore */ }
		}
		this.activeCleanups = [];
		// belt-and-braces for the inline editor's Escape swallower: the cleanup above normally removes
		// it, but the flag has to match the `capture: true` it was registered with (and both events),
		// otherwise removeEventListener silently does nothing.
		if (this._escapeKeyHandler) {
			const handler = this._escapeKeyHandler;
			try {
				activeDocument.removeEventListener('keydown', handler, true);
				activeDocument.removeEventListener('keyup', handler, true);
			} catch { /* ignore */ }
			this._escapeKeyHandler = null;
		}
	}

	addCleanup(fn: () => void): void {
		this.activeCleanups.push(fn);
	}

	/** Serializes saves per list so notes + table writes don't overlap. */
	saveSerialized(listName: string, saveFn: () => Promise<void>): Promise<void> {
		const prev = this.saveQueues.get(listName) ?? Promise.resolve();
		const next = prev.then(saveFn).catch((e) => console.error('[Hoard] custom-list save failed:', e));
		this.saveQueues.set(listName, next);
		return next;
	}

	async render(): Promise<void> {
		const gen = ++this.renderGeneration;
		this.teardownEditor();
		this.container.empty();
		this.container.addClass('hoard-custom-lists');

		const rawNames = this.manager.listNames();
		this.listNames = this.applyTabOrder(rawNames);

		if (this.listNames.length === 0) {
			this.buildEmptyState();
			return;
		}

		if (!this.activeListName || !this.listNames.includes(this.activeListName)) {
			this.activeListName = this.listNames[0] ?? null;
		}

		if (this.activeListName) {
			this.currentList = await this.manager.loadList(this.activeListName);
		}

		const tabColors = await this.manager.loadTabColors(this.listNames);

		if (gen !== this.renderGeneration) return; // stale render
		this.container.empty();
		this.buildSubTabs(tabColors);

		if (this.currentList) {
			this.buildListView(this.currentList);
		}
	}

	private buildEmptyState(): void {
		const es = this.container.createDiv({ cls: 'hoard-cl-empty-state' });
		es.createDiv({ cls: 'hoard-cl-empty-text', text: t('lists.emptyText') });
		const btn = es.createEl('button', { cls: 'hoard-btn hoard-btn-primary', text: t('lists.createFirst') });
		btn.addEventListener('click', () => this.promptCreateList());
	}

	private buildSubTabs(tabColors: Map<string, string>): void {
		const tabBar = this.container.createDiv({ cls: 'hoard-cl-sub-tabs' });
		let dragFromName: string | null = null;

		for (const name of this.listNames) {
			const tab = tabBar.createDiv({
				cls: `hoard-cl-sub-tab${name === this.activeListName ? ' is-active' : ''}`,
			});
			tab.setAttribute('draggable', 'true');

			const nameSpan = tab.createSpan({ cls: 'hoard-cl-sub-tab-name', text: name });
			const tabColor = tabColors.get(name);
			if (tabColor) nameSpan.style.color = tabColor;
			nameSpan.addEventListener('dblclick', (e) => {
				e.stopPropagation();
				this.startRenameTab(tab, nameSpan, name);
			});

			const delBtn = createIconButton(tab, {
				icon: 'x',
				label: t('lists.deleteList', { name }),
				cls: 'hoard-cl-sub-tab-del',
				variant: 'sm',
			});
			delBtn.addEventListener('click', (e) => { e.stopPropagation(); void this.deleteList(name); });

			tab.addEventListener('click', () => {
				if (this.activeListName === name) return;
				this.activeListName = name;
				this.sortCol = null;
				this.sortDir = 'asc';
				this.searchQuery = '';
				this.duplicatedRowIds.clear();
				void this.render();
			});

			tab.addEventListener('dragstart', (e) => {
				dragFromName = name;
				e.dataTransfer?.setData('text/plain', name);
				tab.addClass('hoard-cl-dragging');
			});
			tab.addEventListener('dragend', () => tab.removeClass('hoard-cl-dragging'));
			tab.addEventListener('dragover', (e) => { e.preventDefault(); tab.addClass('hoard-cl-drag-over'); });
			tab.addEventListener('dragleave', () => tab.removeClass('hoard-cl-drag-over'));
			tab.addEventListener('drop', (e) => {
				e.preventDefault();
				tab.removeClass('hoard-cl-drag-over');
				if (!dragFromName || dragFromName === name) return;
				const fromIdx = this.listNames.indexOf(dragFromName);
				const toIdx = this.listNames.indexOf(name);
				if (fromIdx < 0 || toIdx < 0) return;
				this.listNames.splice(fromIdx, 1);
				this.listNames.splice(toIdx, 0, dragFromName);
				this.plugin.settings.customListTabOrder = [...this.listNames];
				void this.plugin.saveSettings().then(() => void this.render());
			});
		}

		const addBtn = createIconButton(tabBar, { icon: 'plus', label: t('lists.newList'), cls: 'hoard-cl-sub-tab-add hoard-btn-success' });
		addBtn.addEventListener('click', () => this.promptCreateList());
	}

	private startRenameTab(tab: HTMLElement, nameSpan: HTMLElement, oldName: string): void {
		nameSpan.hide();
		const input = tab.createEl('input', {
			cls: 'hoard-cl-sub-tab-rename',
			attr: { type: 'text', value: oldName },
		});
		input.focus();
		input.select();

		let finished = false;
		const finish = async (save: boolean): Promise<void> => {
			if (finished) return;
			finished = true;
			input.remove();
			nameSpan.show();
			if (!save) return;
			const newName = input.value.trim();
			if (!newName || newName === oldName) return;
			if (this.listNames.includes(newName)) { new Notice(t('lists.nameExists', { name: newName })); return; }
			await this.manager.renameList(oldName, newName);
			if (this.activeListName === oldName) this.activeListName = newName;
			await this.render();
		};

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') { e.preventDefault(); void finish(true); }
			if (e.key === 'Escape') { void finish(false); }
		});
		input.addEventListener('blur', () => void finish(true));
	}

	private promptCreateList(): void {
		new ListNameModal(this.plugin.app, this.listNames, (trimmed) => {
			const defaultCols = (this.plugin.settings.defaultCustomColumns ?? [])
				.map(c => ({
					...c,
					id: c.id,
					options: c.options ? [...c.options] : undefined,
					optionColors: c.optionColors ? { ...c.optionColors } : undefined,
				}));

			const newList: CustomList = { name: trimmed, columns: defaultCols, rows: [], notes: '' };

			new EditColumnsModal(
				this.plugin.app,
				newList,
				this.manager,
				async (cols) => {
					newList.columns = cols;
					await this.manager.saveList(newList);
					this.activeListName = trimmed;
					this.sortCol = null;
					this.sortDir = 'asc';
					this.searchQuery = '';
					this.duplicatedRowIds.clear();
					await this.render();
				},
			).open();
		}).open();
	}

	private deleteList(name: string): void {
		new ConfirmModal(this.plugin.app, t('lists.deleteConfirm', { name }), () => {
			void (async () => {
				await this.manager.deleteList(name);
				if (this.activeListName === name) { this.activeListName = null; this.currentList = null; }
				await this.render();
			})();
		}).open();
	}

	private buildListView(list: CustomList): void {
		const view = this.container.createDiv({ cls: 'hoard-cl-list-view' });

		const header = view.createDiv({ cls: 'hoard-cl-header' });
		const countEl = header.createSpan({ cls: 'hoard-results-count hoard-cl-count' });
		const toolbar = header.createDiv({ cls: 'hoard-cl-toolbar' });

		const notesBtn = toolbar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.notes') });
		notesBtn.addEventListener('click', () => {
			new NotesModal(
				this.plugin.app,
				list.name,
				list.notes,
				(notes) => this.manager.saveNotes(list, notes),
			).open();
		});

		const sortBtn = toolbar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.sort') });
		let sortPanel: HTMLElement | null = null;
		sortBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			if (sortPanel) { sortPanel.remove(); sortPanel = null; return; }
			sortPanel = this.buildSortPanel(list, toolbar, () => { sortPanel = null; });
			activeDocument.addEventListener('click', () => { sortPanel?.remove(); sortPanel = null; }, { once: true });
		});

		toolbar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.export') })
			.addEventListener('click', () => this.exportToClipboard(list));

		toolbar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.import') })
			.addEventListener('click', () => this.openImport(list));

		toolbar.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.tableSettings') })
			.addEventListener('click', () => {
				new EditColumnsModal(
					this.plugin.app,
					list,
					this.manager,
					async (cols) => {
						const colIds = new Set(cols.map(c => c.id));
						for (const row of list.rows) {
							for (const key of Object.keys(row)) {
								if (key !== 'id' && key !== 'name' && key !== 'checked' && !colIds.has(key)) {
									delete (row as Record<string, unknown>)[key];
								}
							}
						}
						list.columns = cols;
						for (const col of cols) {
							if (col.type === 'number' && col.autoTime) {
								this.autoPopulateTimeColumn(list, col);
							}
						}
						await this.manager.saveList(list);
						await this.render();
					},
				).open();
			});

		const searchWrap = view.createDiv({ cls: 'hoard-search-wrap' });
		const searchInput = searchWrap.createEl('input', {
			cls: 'hoard-search-input',
			attr: { type: 'text', placeholder: t('lists.searchPlaceholder'), value: this.searchQuery },
		});
		let searchDebounce: number | null = null;
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value;
			if (searchDebounce !== null) window.clearTimeout(searchDebounce);
			searchDebounce = window.setTimeout(() => {
				searchDebounce = null;
				if (this._tableContainer && this._countEl) {
					this._tableContainer.empty();
					this.buildTable(this._tableContainer, list, this._countEl);
				}
			}, 250);
		});

		if (this.plugin.settings.showHintBanners) {
			view.createDiv({
				cls: 'hoard-cl-draft-banner',
				text: `⚠ ${t('lists.draftBanner')}`,
			});
		}

		const tableWrap = view.createDiv({ cls: 'hoard-cl-table-wrap' });
		this.buildTable(tableWrap, list, countEl);
	}

	private buildSortPanel(list: CustomList, anchor: HTMLElement, onClose: () => void): HTMLElement {
		const panel = anchor.createDiv({ cls: 'hoard-cl-sort-panel' });

		const row1 = panel.createDiv({ cls: 'hoard-filter-row' });
		row1.createSpan({ cls: 'hoard-filter-label', text: t('lists.sortBy') });
		const colSel = row1.createEl('select', { cls: 'hoard-select' });
		colSel.createEl('option', { value: 'name', text: t('lists.name') });
		for (const col of list.columns.filter(c => !c.locked)) {
			colSel.createEl('option', { value: col.id, text: col.label });
		}
		if (this.sortCol) colSel.value = this.sortCol;

		const row2 = panel.createDiv({ cls: 'hoard-filter-row' });
		row2.createSpan({ cls: 'hoard-filter-label', text: t('lists.direction') });
		const dirSel = row2.createEl('select', { cls: 'hoard-select' });
		dirSel.createEl('option', { value: 'asc', text: t('lists.ascending') });
		dirSel.createEl('option', { value: 'desc', text: t('lists.descending') });
		dirSel.value = this.sortDir;

		const btnRow = panel.createDiv({ cls: 'hoard-modal-btn-row' });
		btnRow.createEl('button', { cls: 'hoard-btn hoard-btn-sm', text: t('lists.clearSort') })
			.addEventListener('click', (e) => { e.stopPropagation(); this.sortCol = null; this.sortDir = 'asc'; onClose(); void this.render(); });
		btnRow.createEl('button', { cls: 'hoard-btn hoard-btn-sm hoard-btn-primary', text: t('lists.apply') })
			.addEventListener('click', (e) => {
				e.stopPropagation();
				this.sortCol = colSel.value;
				this.sortDir = dirSel.value as 'asc' | 'desc';
				onClose();
				void this.render();
			});

		panel.addEventListener('click', (e) => e.stopPropagation());
		return panel;
	}

	/** Gather the export table (headers + plain string cells) once, reused by every format. */
	private gatherExportData(list: CustomList): { headers: string[]; rows: string[][] } {
		const nonLockedCols = list.columns.filter(c => !c.locked);
		const allCols = [{ id: '#', label: '#' }, { id: 'name', label: 'Name' }, ...nonLockedCols];
		const headers = allCols.map(c => c.label);
		const rows = this.getFilteredSortedRows(list).map((row, i) => allCols.map(c => {
			if (c.id === '#') return String(i + 1);
			const val = (row as Record<string, string | number | null | undefined>)[c.id];
			return val !== undefined && val !== null ? String(val) : '';
		}));
		return { headers, rows };
	}

	private buildMarkdown(data: { headers: string[]; rows: string[][] }): string {
		const header = '| ' + data.headers.join(' | ') + ' |';
		const sep = '| ' + data.headers.map(() => '---').join(' | ') + ' |';
		const rows = data.rows.map(cells => '| ' + cells.join(' | ') + ' |');
		return [header, sep, ...rows].join('\n');
	}

	private buildTsv(data: { headers: string[]; rows: string[][] }): string {
		return [data.headers, ...data.rows].map(cells => cells.join('\t')).join('\n');
	}

	private exportToClipboard(list: CustomList): void {
		new ExportFormatModal(this.plugin.app, (format) => {
			const data = this.gatherExportData(list);
			const text = format === 'tsv' ? this.buildTsv(data) : this.buildMarkdown(data);
			navigator.clipboard.writeText(text)
				.then(() => new Notice(t('lists.copied')))
				.catch(() => new Notice(t('lists.copyFailed')));
		}).open();
	}

	private openImport(list: CustomList): void {
		new ImportListModal(this.plugin.app, list, this.manager, async () => {
			await this.manager.saveList(list);
			await this.render();
		}).open();
	}

	private getFilteredSortedRows(list: CustomList): CustomListRow[] {
		let rows = [...list.rows];
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.toLowerCase();
			rows = rows.filter(r => String((r as Record<string, string | undefined>)['name'] ?? '').toLowerCase().includes(q));
		}
		if (this.sortCol) {
			const col = this.sortCol;
			const dir = this.sortDir;
			rows.sort((a, b) => {
				const av = String((a as Record<string, string | number | undefined>)[col] ?? '').toLowerCase();
				const bv = String((b as Record<string, string | number | undefined>)[col] ?? '').toLowerCase();
				return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
			});
		}
		return rows;
	}

	// Table

	private buildTable(container: HTMLElement, list: CustomList, countEl: HTMLElement): void {
		// refs for keyboard navigation and the search rebuild
		this._countEl = countEl;
		this._tableContainer = container;

		const visibleRows = this.getFilteredSortedRows(list);
		countEl.textContent = t('lists.titleCount', { count: visibleRows.length });

		const nonLockedCols = list.columns.filter(c => !c.locked);

		const table = container.createDiv({ cls: 'hoard-cl-table' });

		const thead = table.createDiv({ cls: 'hoard-cl-thead' });
		const hRow = thead.createDiv({ cls: 'hoard-cl-tr hoard-cl-tr-header' });
		// tick column header: a two-state select-all over the visible rows
		const tickTh = hRow.createDiv({ cls: 'hoard-cl-th hoard-cl-th-tick' });
		const allChecked = visibleRows.length > 0 && visibleRows.every(r => r.checked === true);
		const selectAllBtn = tickTh.createDiv({ cls: `hoard-cl-tick-btn${allChecked ? ' is-checked' : ''}` });
		selectAllBtn.title = allChecked ? t('lists.uncheckAll') : t('lists.checkAll');
		selectAllBtn.textContent = allChecked ? '✓' : '○';
		selectAllBtn.addEventListener('click', () => {
			// only affect currently visible (filtered/searched) rows
			const visibleIds = new Set(visibleRows.map(r => r.id));
			const next = !allChecked;
			for (const r of list.rows) if (visibleIds.has(r.id)) r.checked = next;
			void this.manager.saveList(list).then(() => { container.empty(); this.buildTable(container, list, countEl); });
		});
		hRow.createDiv({ cls: 'hoard-cl-th hoard-cl-th-num', text: '#' });
		const nameTh = hRow.createDiv({ cls: 'hoard-cl-th', text: t('lists.name') });
		nameTh.dataset.wlCol = '__name';
		this.addResizeHandle(nameTh, '__name', list, table);
		for (const col of nonLockedCols) {
			const th = hRow.createDiv({ cls: 'hoard-cl-th' });
			th.dataset.wlCol = col.id;
			th.createSpan({ text: col.label });
			this.addResizeHandle(th, col.id, list, table);
			if (col.type === 'number' && col.autoTime) {
				const refreshBtn = createIconButton(th, {
					icon: 'refresh-cw',
					label: t('lists.refreshRemaining'),
					cls: 'hoard-cl-autotime-refresh',
					variant: 'sm',
				});
				refreshBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.autoPopulateTimeColumn(list, col);
					void this.manager.saveList(list).then(() => {
						container.empty();
						this.buildTable(container, list, countEl);
					});
				});
			}
		}
		hRow.createDiv({ cls: 'hoard-cl-th hoard-cl-th-actions' });

		const tbody = table.createDiv({ cls: 'hoard-cl-tbody' });
		let dragFromIndex = -1;

		// one listener for every row's add button — the table rebuilds on each edit, so per-row
		// listeners here would be re-bound N times per keystroke
		tbody.addEventListener('click', (e) => {
			const btn = (e.target as HTMLElement).closest('.hoard-cl-add-btn');
			if (!btn) return;
			const rowId = btn.closest<HTMLElement>('[data-row-id]')?.dataset.rowId;
			const target = list.rows.find((r) => r.id === rowId);
			const name = target ? rowName(target) : '';
			if (!name) return;
			openAddForTitle({
				plugin: this.plugin,
				dataManager: this.dataManager,
				title: name,
				heading: t('lists.addTitle'),
			});
		});

		visibleRows.forEach((row, displayIdx) => {
			const isChecked = row.checked === true;
			const tr = tbody.createDiv({ cls: `hoard-cl-tr hoard-cl-tr-body${isChecked ? ' hoard-cl-tr-checked' : ''}` });
			tr.dataset.rowId = row.id;

			const tickCell = tr.createDiv({ cls: 'hoard-cl-td hoard-cl-td-tick' });
			const tickBtn = tickCell.createDiv({ cls: `hoard-cl-tick-btn${isChecked ? ' is-checked' : ''}` });
			tickBtn.title = isChecked ? t('lists.uncheckRow') : t('lists.checkRow');
			tickBtn.textContent = isChecked ? '✓' : '○';
			tickBtn.addEventListener('click', () => {
				const realRow = list.rows.find((r) => r.id === row.id);
				if (!realRow) return;
				realRow.checked = !realRow.checked;
				void this.manager.saveList(list).then(() => { container.empty(); this.buildTable(container, list, countEl); });
			});

			tr.createDiv({ cls: 'hoard-cl-td hoard-cl-td-num', text: String(displayIdx + 1) });

			const nameCell = tr.createDiv({ cls: 'hoard-cl-td hoard-cl-td-name' });
			nameCell.dataset.wlCol = '__name';
			this.renderNameCell(nameCell, row, list, countEl, nonLockedCols, container);

			for (const col of nonLockedCols) {
				const td = tr.createDiv({ cls: 'hoard-cl-td' });
				td.dataset.wlCol = col.id;
				this.renderCustomCell(td, row, col, list);
			}

			const actCell = tr.createDiv({ cls: 'hoard-cl-td hoard-cl-td-actions' });

			const dragHandle = createIconButton(actCell, {
				icon: 'grip-vertical',
				label: t('ui.columns.dragToReorder'),
				cls: 'hoard-cl-row-action hoard-cl-drag-handle',
			});
			// mouse-only grip: no tab stop without a keyboard action behind it
			dragHandle.tabIndex = -1;
			dragHandle.setAttribute('aria-hidden', 'true');

			// unnamed rows have nothing to send to a library; the click is delegated on the table
			if (rowName(row)) {
				createIconButton(actCell, { icon: 'plus', label: t('lists.addToLibrary'), cls: 'hoard-cl-row-action hoard-cl-add-btn' });
			}

			const dupBtn = createIconButton(actCell, { icon: 'copy', label: t('lists.duplicateRow'), cls: 'hoard-cl-row-action hoard-cl-dup-btn' });
			dupBtn.addEventListener('click', () => {
				const realIdx = list.rows.findIndex(r => r.id === row.id);
				if (realIdx < 0) return;
				const newRow: CustomListRow = {
					...list.rows[realIdx],
					id: this.manager.generateRowId(list.rows),
				};
				list.rows.splice(realIdx + 1, 0, newRow);
				this.duplicatedRowIds.add(newRow.id);
				void this.manager.saveList(list).then(() => { container.empty(); this.buildTable(container, list, countEl); });
			});

			const rowDelBtn = createIconButton(actCell, { icon: 'x', label: t('lists.deleteRow'), cls: 'hoard-cl-row-action hoard-cl-row-del' });
			rowDelBtn.addEventListener('click', () => {
				list.rows = list.rows.filter(r => r.id !== row.id);
				this.duplicatedRowIds.delete(row.id);
				void this.manager.saveList(list).then(() => { container.empty(); this.buildTable(container, list, countEl); });
			});

			// drag & drop (handle-initiated only)
			tr.setAttribute('draggable', 'false');
			dragHandle.addEventListener('mousedown', () => tr.setAttribute('draggable', 'true'));
			tr.addEventListener('dragstart', (e) => {
				dragFromIndex = list.rows.findIndex(r => r.id === row.id);
				e.dataTransfer?.setData('text/plain', row.id);
				tr.addClass('hoard-cl-dragging');
			});
			tr.addEventListener('dragend', () => { tr.removeClass('hoard-cl-dragging'); tr.setAttribute('draggable', 'false'); });
			tr.addEventListener('dragover', (e) => { e.preventDefault(); tr.addClass('hoard-cl-drag-over'); });
			tr.addEventListener('dragleave', () => tr.removeClass('hoard-cl-drag-over'));
			tr.addEventListener('drop', (e) => {
				e.preventDefault();
				tr.removeClass('hoard-cl-drag-over');
				const toRealIdx = list.rows.findIndex(r => r.id === row.id);
				if (dragFromIndex !== toRealIdx && dragFromIndex >= 0) {
					const [moved] = list.rows.splice(dragFromIndex, 1);
					list.rows.splice(dragFromIndex < toRealIdx ? toRealIdx - 1 : toRealIdx, 0, moved!);
					void this.manager.saveList(list).then(() => { container.empty(); this.buildTable(container, list, countEl); });
				}
			});
		});

		// apply persisted column widths — switches the table into resizable mode
		this.applyColumnWidths(table, list);

		const addRowEl = container.createDiv({ cls: 'hoard-cl-add-row' });
		addRowEl.createEl('button', { cls: 'hoard-btn hoard-btn-sm hoard-btn-success', text: t('lists.addRow') })
			.addEventListener('click', () => {
				const newRow: CustomListRow = { id: this.manager.generateRowId(list.rows), name: '' };
				list.rows.push(newRow);
				void this.manager.saveList(list).then(() => {
					container.empty();
					this.buildTable(container, list, countEl);
					window.setTimeout(() => {
						const newTbody = container.querySelector('.hoard-cl-tbody');
						const lastTr = newTbody?.querySelector('.hoard-cl-tr-body:last-child') as HTMLElement | null;
						(lastTr?.querySelector('.hoard-cl-td-name') as HTMLElement | null)?.click();
					}, 0);
				});
			});
	}

	// Column resize (Excel-style)

	/** True when the Name column or any custom column has an explicit width. */
	private isTableResizable(list: CustomList): boolean {
		return list.nameWidth !== undefined || list.columns.some((c) => !c.locked && c.width !== undefined);
	}

	private getColWidth(list: CustomList, key: string): number | undefined {
		if (key === '__name') return list.nameWidth;
		return list.columns.find((c) => c.id === key)?.width;
	}

	private setColWidth(list: CustomList, key: string, width: number): void {
		if (key === '__name') { list.nameWidth = width; return; }
		const col = list.columns.find((c) => c.id === key);
		if (col) col.width = width;
	}

	/**
	 * Applies persisted widths to every resizable column. Once any width exists the table enters
	 * explicit-width mode (no flex redistribution, horizontal scroll); resizable columns without a
	 * stored width fall back to a default fixed width, so they can't compress to absorb a
	 * neighbour's resize. Lists never resized keep the flex layout untouched.
	 */
	private applyColumnWidths(table: HTMLElement, list: CustomList): void {
		if (!this.isTableResizable(list)) {
			table.removeClass('hoard-cl-table-resizable');
			return;
		}
		table.addClass('hoard-cl-table-resizable');
		const apply = (key: string, width: number | undefined): void => {
			const w = width ?? DEFAULT_COL_WIDTH;
			table.querySelectorAll<HTMLElement>(`[data-hoard-col="${key}"]`).forEach((el) => {
				el.addClass('hoard-cl-col-fixed');
				el.setCssProps({ '--hoard-cl-cw': `${w}px` });
			});
		};
		apply('__name', list.nameWidth);
		for (const col of list.columns) {
			if (col.locked) continue;
			apply(col.id, col.width);
		}
	}

	/**
	 * Pins every resizable column to its current rendered width. Called the first time a handle is
	 * grabbed, so switching into explicit-width mode doesn't make the columns jump.
	 */
	private pinCurrentWidths(table: HTMLElement, list: CustomList): void {
		const measure = (key: string): number => {
			const el = table.querySelector<HTMLElement>(`.hoard-cl-th[data-hoard-col="${key}"]`);
			return el ? Math.round(el.getBoundingClientRect().width) : DEFAULT_COL_WIDTH;
		};
		if (list.nameWidth === undefined) list.nameWidth = measure('__name');
		for (const col of list.columns) {
			if (col.locked || col.width !== undefined) continue;
			col.width = measure(col.id);
		}
	}

	/** Adds a right-edge drag handle to a resizable header cell (desktop only). */
	private addResizeHandle(th: HTMLElement, key: string, list: CustomList, table: HTMLElement): void {
		if (Platform.isMobile) return;
		th.addClass('hoard-cl-th-resizable');
		const handle = th.createDiv({ cls: 'hoard-cl-col-resize' });
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			// pin every column to its current width, then switch to explicit-width mode
			this.pinCurrentWidths(table, list);
			this.applyColumnWidths(table, list);
			const startX = e.clientX;
			const startWidth = this.getColWidth(list, key) ?? DEFAULT_COL_WIDTH;
			const onMove = (ev: MouseEvent): void => {
				const newWidth = Math.max(MIN_COL_WIDTH, Math.round(startWidth + (ev.clientX - startX)));
				this.setColWidth(list, key, newWidth);
				table.querySelectorAll<HTMLElement>(`[data-hoard-col="${key}"]`).forEach((el) => {
					el.setCssProps({ '--hoard-cl-cw': `${newWidth}px` });
				});
			};
			const onUp = (): void => {
				activeDocument.removeEventListener('mousemove', onMove);
				activeDocument.removeEventListener('mouseup', onUp);
				activeDocument.body.removeClass('hoard-cl-col-resizing');
				// persist only on drag end
				void this.manager.saveList(list);
			};
			activeDocument.addEventListener('mousemove', onMove);
			activeDocument.addEventListener('mouseup', onUp);
			activeDocument.body.addClass('hoard-cl-col-resizing');
		});
	}

	// Cell rendering

	/**
	 * Mobile: scrolls the active element into view when the keyboard shrinks the viewport.
	 * Returns a function that detaches the listener (also registered as cleanup).
	 */
	private watchKeyboardScroll(cell: HTMLElement): () => void {
		const onResize = (): void => {
			const active = activeDocument.activeElement as HTMLElement | null;
			if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
		};
		const detach = (): void => {
			if (window.visualViewport) window.visualViewport.removeEventListener('resize', onResize);
		};
		if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
		this.addCleanup(detach);
		window.setTimeout(() => cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
		return detach;
	}

	/** Removes the capture-phase Escape guard installed while a name cell is edited. */
	private releaseEscapeGuard(): void {
		if (!this._escapeKeyHandler) return;
		activeDocument.removeEventListener('keydown', this._escapeKeyHandler, true);
		activeDocument.removeEventListener('keyup', this._escapeKeyHandler, true);
		this._escapeKeyHandler = null;
	}

	/**
	 * Swallows Escape at document level so it never reaches Obsidian (view/modal close). Escape keydown
	 * on the input itself is let through: the input's own handler closes the dropdown or cancels, and stops it there.
	 */
	private installEscapeGuard(input: HTMLElement): void {
		const handler = (e: KeyboardEvent): void => {
			if (e.key !== 'Escape' || (e.type === 'keydown' && e.target === input)) return;
			e.stopPropagation();
			e.stopImmediatePropagation();
			e.preventDefault();
		};
		this._escapeKeyHandler = handler;
		activeDocument.addEventListener('keydown', handler, true);
		activeDocument.addEventListener('keyup', handler, true);
		this.addCleanup(() => {
			activeDocument.removeEventListener('keydown', handler, true);
			activeDocument.removeEventListener('keyup', handler, true);
		});
	}

	private renderNameCell(
		cell: HTMLElement,
		row: CustomListRow,
		list: CustomList,
		countEl: HTMLElement,
		nonLockedCols: CustomListColumn[],
		tableContainer: HTMLElement,
	): void {
		cell.empty();
		cell.removeClass('hoard-cl-editing');
		const nameVal = String((row as Record<string, string | undefined>)['name'] ?? '');
		const isDuplicated = this.duplicatedRowIds.has(row.id);

		if (nameVal) {
			const span = cell.createSpan({ cls: 'hoard-cl-cell-text', text: nameVal });
			if (isDuplicated) span.addClass('hoard-cl-dup-name');
		} else {
			cell.createSpan({ cls: 'hoard-cl-cell-empty', text: '—' });
		}

		cell.addEventListener('click', () => {
			this.startNameEdit(cell, row, list, countEl, nonLockedCols, tableContainer);
		}, { once: true });
	}

	private startNameEdit(
		cell: HTMLElement,
		row: CustomListRow,
		list: CustomList,
		countEl: HTMLElement,
		nonLockedCols: CustomListColumn[],
		tableContainer: HTMLElement,
	): void {
		const prevVal = String((row as Record<string, string | undefined>)['name'] ?? '');

		cell.empty();
		cell.addClass('hoard-cl-editing');
		const stopKeyboardScroll = this.watchKeyboardScroll(cell);

		const wrap = cell.createDiv({ cls: 'hoard-cl-autofill-wrap' });
		const input = wrap.createEl('input', {
			cls: 'hoard-cl-cell-input',
			attr: { type: 'text', value: prevVal },
		});
		input.focus();
		input.select();

		this.installEscapeGuard(input);

		// autofill renders on document.body, position:fixed, to escape the table's overflow:hidden
		let dropdown: HTMLElement | null = null;
		let focusedSuggestionIdx = -1;
		const clearDropdown = (): void => { dropdown?.remove(); dropdown = null; focusedSuggestionIdx = -1; };

		input.addEventListener('input', () => {
			clearDropdown();
			const q = input.value.toLowerCase();
			if (!q) return;
			// suggestions come from every library: Watchlist, Reading (Books + Manga) and Games
			const reading = this.plugin.readingDataManager;
			const suggestions: { title: string; meta: string }[] = [
				...this.dataManager.getTitles().map(ti => ({ title: ti.title, meta: `${typeLabel(ti.type)} · ${statusLabel(ti.status)}` })),
				...reading.getBooks().map(b => ({ title: b.title, meta: `${t('lists.book')} · ${readingStatusLabel(b.status)}` })),
				...reading.getMangaList().map(m => ({ title: m.title, meta: `${t('lists.manga')} · ${readingStatusLabel(m.status)}` })),
				...this.plugin.gameDataManager.getGames().map(g => ({ title: g.title, meta: `${t('lists.game')} · ${g.status}` })),
			]
				.filter(s => s.title.toLowerCase().includes(q))
				.slice(0, 10);
			if (!suggestions.length) return;
			const rect = input.getBoundingClientRect();
			dropdown = activeDocument.body.createDiv({ cls: 'hoard-cl-autofill-dropdown hoard-pos-fixed' });
			dropdown.style.top = `${rect.bottom}px`;
			dropdown.style.left = `${rect.left}px`;
			dropdown.style.width = `${rect.width}px`;
			for (const sug of suggestions) {
				const item = dropdown.createDiv({ cls: 'hoard-result-item' });
				item.createDiv({ cls: 'hoard-result-title', text: sug.title });
				item.createDiv({ cls: 'hoard-result-meta', text: sug.meta });
				item.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = sug.title; clearDropdown(); });
			}
		});

		let saved = false;
		let navDirection: CellNavDirection | null = null;

		const doSave = async (cancel: boolean): Promise<void> => {
			if (saved) return;
			saved = true;
			stopKeyboardScroll();
			this.releaseEscapeGuard();
			clearDropdown();
			const newVal = input.value.trim();
			if (!cancel) {
				const isDup = this.duplicatedRowIds.has(row.id);
				(row as Record<string, unknown>)['name'] = newVal;
				if (isDup && newVal !== prevVal) this.duplicatedRowIds.delete(row.id);
				await this.manager.saveList(list);
			}
			this.renderNameCell(cell, row, list, countEl, nonLockedCols, tableContainer);
			if (!cancel && navDirection) this.navigateCell(cell, navDirection);
		};

		/** Arrow / Enter / Escape on the open suggestion list; true when the key was consumed. */
		const handleSuggestionKey = (e: KeyboardEvent, list: HTMLElement): boolean => {
			const items = Array.from(list.querySelectorAll<HTMLElement>('.hoard-result-item'));
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				e.preventDefault();
				focusedSuggestionIdx = e.key === 'ArrowDown'
					? Math.min(focusedSuggestionIdx + 1, items.length - 1)
					: Math.max(focusedSuggestionIdx - 1, 0);
				items.forEach((item, i) => item.toggleClass('hoard-result-item-focused', i === focusedSuggestionIdx));
				return true;
			}
			if (e.key === 'Enter' && focusedSuggestionIdx >= 0) {
				e.preventDefault();
				const titleText = items[focusedSuggestionIdx]?.querySelector<HTMLElement>('.hoard-result-title')?.textContent ?? '';
				if (titleText) input.value = titleText;
				clearDropdown();
				return true;
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				if (!e.isComposing) clearDropdown(); // composition Escape only aborts the composition
				return true;
			}
			return false;
		};

		input.addEventListener('blur', () => void doSave(false));
		input.addEventListener('keydown', (e) => {
			if (dropdown && handleSuggestionKey(e, dropdown)) return;
			handleEditKey(e, (nav) => { navDirection = nav; void doSave(false); }, () => void doSave(true));
		});
	}

	private renderCustomCell(
		cell: HTMLElement,
		row: CustomListRow,
		col: CustomListColumn,
		list: CustomList,
	): void {
		cell.empty();
		cell.removeClass('hoard-cl-editing');
		const val = (row as Record<string, string | number | undefined>)[col.id];

		if (col.type === 'select') {
			const strVal = String(val ?? '');
			if (strVal) {
				const badge = cell.createSpan({ cls: 'hoard-cl-select-badge', text: strVal });
				const optColor = col.optionColors?.[strVal];
				// no colour assigned → leave the badge exactly as the default CSS renders it
				if (optColor) {
					badge.style.backgroundColor = deriveFillColor(optColor);
					badge.style.borderColor = deriveBorderColor(optColor);
					badge.style.color = deriveBorderColor(optColor);
				}
			} else {
				cell.createSpan({ cls: 'hoard-cl-cell-empty', text: '—' });
			}
		} else {
			const strVal = val !== undefined && val !== null && val !== '' ? String(val) : '';
			if (strVal) {
				const span = cell.createSpan({ cls: 'hoard-cl-cell-text', text: strVal });
				if (col.bold) span.addClass('hoard-cell-bold');
				if (col.italic) span.addClass('hoard-cell-italic');
			} else {
				cell.createSpan({ cls: 'hoard-cl-cell-empty', text: '—' });
			}
		}

		// select cells open the shared dropdown on a single click (the native <select> needed a second);
		// other types enter the inline editor
		cell.addEventListener('click', () => {
			if (col.type === 'select') this.openSelectDropdown(cell, row, col, list);
			else this.startCustomEdit(cell, row, col, list);
		}, { once: true });
	}

	/**
	 * Opens the shared status-style dropdown for a select cell, colouring each option's dot from the
	 * column's per-option colours (unset → default dot).
	 */
	private openSelectDropdown(
		cell: HTMLElement,
		row: CustomListRow,
		col: CustomListColumn,
		list: CustomList,
	): void {
		const currentVal = String((row as Record<string, string | number | undefined>)[col.id] ?? '');
		const options = [
			{ value: '', label: '—' },
			...(col.options ?? []).map((opt) => ({ value: opt, label: opt })),
		];
		openStatusDropdown({
			anchor: cell,
			container: activeDocument.body,
			options,
			getOptionColor: (value) => col.optionColors?.[value] ?? null,
			onSelect: (value) => {
				if (value !== currentVal) {
					(row as Record<string, unknown>)[col.id] = value === '' ? undefined : value;
					void this.manager.saveList(list).then(() => this.renderCustomCell(cell, row, col, list));
				} else {
					this.renderCustomCell(cell, row, col, list);
				}
			},
			// re-render to re-attach the cell's once-only click handler
			onClose: () => this.renderCustomCell(cell, row, col, list),
		});
	}

	private startCustomEdit(
		cell: HTMLElement,
		row: CustomListRow,
		col: CustomListColumn,
		list: CustomList,
	): void {
		const currentVal = (row as Record<string, string | number | undefined>)[col.id];

		cell.empty();
		cell.addClass('hoard-cl-editing');

		const stopKeyboardScroll = this.watchKeyboardScroll(cell);

		let getValue: () => string | number | undefined;
		let saved = false;
		let navDirection: CellNavDirection | null = null;

		const doSave = async (cancel: boolean): Promise<void> => {
			if (saved) return;
			saved = true;
			stopKeyboardScroll();
			this.releaseEscapeGuard();
			cell.removeClass('hoard-cl-editing');
			if (!cancel) {
				const newVal = getValue();
				(row as Record<string, unknown>)[col.id] = (newVal === '' || newVal === undefined) ? undefined : newVal;
				await this.manager.saveList(list);
			}
			this.renderCustomCell(cell, row, col, list);
			if (!cancel && navDirection) this.navigateCell(cell, navDirection);
		};

		// select cells never reach startCustomEdit — they open the shared dropdown (openSelectDropdown)
		const isNumber = col.type === 'number';
		const input = cell.createEl('input', {
			cls: 'hoard-cl-cell-input',
			attr: { type: isNumber ? 'number' : 'text', value: currentVal !== undefined && currentVal !== null ? String(currentVal) : '' },
		});
		getValue = isNumber
			? () => { const n = parseFloat(input.value); return isNaN(n) ? '' : n; }
			: () => input.value;
		input.focus();
		input.select();
		input.addEventListener('blur', () => void doSave(false));
		input.addEventListener('keydown', (e) => {
			handleEditKey(e, (nav) => { navDirection = nav; void doSave(false); }, () => void doSave(true));
		});
	}

	// Auto-populate time column

	private autoPopulateTimeColumn(list: CustomList, col: CustomListColumn): void {
		const titles = this.dataManager.getTitles();
		for (const row of list.rows) {
			const rowName = String(row['name'] ?? '').trim();
			if (!rowName) continue;
			const match = titles.find(t => t.title === rowName);
			if (!match) {
				row[col.id] = 'Not found';
				continue;
			}
			const remainingMinutes = this.dataManager.calcTimeRemainingForModal(match);
			row[col.id] = remainingMinutes;
		}
	}

	// Keyboard navigation

	/** Editable cells (Name + custom) in a row, skipping # and actions. */
	private getEditableCells(tr: Element): Element[] {
		return Array.from(tr.querySelectorAll(':scope > .hoard-cl-td'))
			.filter(c => !c.classList.contains('hoard-cl-td-num') && !c.classList.contains('hoard-cl-td-actions'));
	}

	private navigateCell(cell: HTMLElement, direction: CellNavDirection): void {
		const tr = cell.closest('.hoard-cl-tr-body');
		const tbody = tr?.parentElement;
		if (!tr || !tbody) return;

		const rows = Array.from(tbody.querySelectorAll(':scope > .hoard-cl-tr-body'));
		const rowIdx = rows.indexOf(tr);
		const editableCells = this.getEditableCells(tr);
		const target = cellNavTarget(direction, rowIdx, editableCells.indexOf(cell), rows.length, editableCells.length);
		if (!target) return;
		if ('addRow' in target) { this.addRowForNavigation(target.addRow); return; }

		const targetRow = target.row === 'same' ? tr : rows[target.row];
		const cells = targetRow ? this.getEditableCells(targetRow) : [];
		if (!cells.length) return;
		const idx = target.col === 'last' ? cells.length - 1 : Math.min(target.col, cells.length - 1);
		window.setTimeout(() => (cells[idx] as HTMLElement | undefined)?.click(), 10);
	}

	private addRowForNavigation(colIdx: number): void {
		const list = this.currentList;
		const tableContainer = this._tableContainer;
		const countEl = this._countEl;
		if (!list || !tableContainer || !countEl) return;

		const newRow: CustomListRow = { id: this.manager.generateRowId(list.rows), name: '' };
		list.rows.push(newRow);
		void this.manager.saveList(list).then(() => {
			tableContainer.empty();
			this.buildTable(tableContainer, list, countEl);
			window.setTimeout(() => {
				const newTbody = tableContainer.querySelector('.hoard-cl-tbody');
				if (!newTbody) return;
				const allRows = Array.from(newTbody.querySelectorAll('.hoard-cl-tr-body'));
				const lastRow = allRows[allRows.length - 1];
				if (!lastRow) return;
				const cells = this.getEditableCells(lastRow);
				const target = cells[Math.min(colIdx, cells.length - 1)] as HTMLElement | undefined;
				target?.click();
			}, 50);
		});
	}
}

// ExportFormatModal — export format chooser

class ExportFormatModal extends Modal {
	private onChoose: (format: 'tsv' | 'md') => void;

	constructor(app: App, onChoose: (format: 'tsv' | 'md') => void) {
		super(app);
		this.onChoose = onChoose;
	}

	onOpen(): void {
		this.titleEl.setText(t('lists.exportTitle'));
		this.contentEl.addClass('hoard-export-modal');

		this.contentEl.createDiv({
			cls: 'hoard-settings-info',
			text: t('lists.exportInfo'),
		});

		const row = this.contentEl.createDiv({ cls: 'hoard-modal-btn-row' });
		const tsvBtn = row.createEl('button', { cls: 'hoard-btn hoard-btn-primary', text: t('lists.copyTsv') });
		tsvBtn.addEventListener('click', () => { this.close(); this.onChoose('tsv'); });
		const mdBtn = row.createEl('button', { cls: 'hoard-btn', text: t('lists.copyMarkdown') });
		mdBtn.addEventListener('click', () => { this.close(); this.onChoose('md'); });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ImportListModal — paste TSV from a spreadsheet, preview, append rows

/** Result of analysing the pasted TSV against the list's current columns. */
interface ImportAnalysis {
	header: string[];
	dataRows: string[][];
	rowCount: number;
	/** Max column count across every pasted line (header + data). */
	totalCols: number;
	/** How many existing data columns there are (Name + non-locked). */
	existingCount: number;
	/** New text columns auto-created to match wider pasted data. */
	newColCount: number;
	/** Per select column: distinct new option values that will be added. */
	selectAdditions: { label: string; values: string[] }[];
	/** Labels of number columns receiving non-numeric values (blocking). */
	numberConflicts: string[];
}

/** Target of one pasted column: the row name or a list column. */
type ImportSlot = CustomListColumn | 'name';

class ImportListModal extends Modal {
	private list: CustomList;
	private manager: CustomListManager;
	private onApplied: () => Promise<void>;

	private textarea!: HTMLTextAreaElement;
	private previewEl!: HTMLElement;
	private addBtn!: HTMLButtonElement;
	private firstRowIsHeader = true;

	constructor(app: App, list: CustomList, manager: CustomListManager, onApplied: () => Promise<void>) {
		super(app);
		this.list = list;
		this.manager = manager;
		this.onApplied = onApplied;
	}

	onOpen(): void {
		this.titleEl.setText(t('lists.importTitle'));
		this.contentEl.addClass('hoard-import-modal');

		this.contentEl.createDiv({
			cls: 'hoard-settings-info',
			text: t('lists.importInfo'),
		});

		this.textarea = this.contentEl.createEl('textarea', {
			cls: 'hoard-modal-textarea hoard-import-textarea',
			attr: { placeholder: t('lists.pastePlaceholder'), rows: '8' },
		});
		this.textarea.addEventListener('input', () => this.refreshPreview());

		const headerToggleRow = this.contentEl.createDiv({ cls: 'hoard-import-header-toggle' });
		const headerCheckbox = headerToggleRow.createEl('input', {
			cls: 'hoard-import-header-checkbox',
			attr: { type: 'checkbox', id: 'hoard-import-header-cb' },
		});
		headerCheckbox.checked = this.firstRowIsHeader;
		headerToggleRow.createEl('label', {
			text: t('lists.firstRowHeader'),
			attr: { for: 'hoard-import-header-cb' },
		});
		headerCheckbox.addEventListener('change', () => {
			this.firstRowIsHeader = headerCheckbox.checked;
			this.refreshPreview();
		});

		this.previewEl = this.contentEl.createDiv({ cls: 'hoard-import-preview' });

		const btnRow = this.contentEl.createDiv({ cls: 'hoard-modal-btn-row' });
		this.addBtn = btnRow.createEl('button', { cls: 'hoard-btn hoard-btn-primary', text: t('common.add') });
		this.addBtn.addEventListener('click', () => void this.apply());
		btnRow.createEl('button', { cls: 'hoard-btn', text: t('common.cancel') })
			.addEventListener('click', () => this.close());

		this.refreshPreview();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Splits the pasted text into header + data rows (tab-delimited). */
	private parse(): { header: string[]; dataRows: string[][] } | null {
		const lines = this.textarea.value
			.replace(/\r\n?/g, '\n')
			.split('\n')
			.filter(l => l.length > 0);
		if (lines.length === 0) return null;
		if (!this.firstRowIsHeader) {
			// every line is a data row; columns map positionally and no line is consumed as a header, so a
			// single lone row can be imported
			return {
				header: [],
				dataRows: lines.map(l => l.split('\t').map(c => c.trim())),
			};
		}
		const [headerLine, ...rest] = lines;
		return {
			header: headerLine!.split('\t').map(c => c.trim()),
			dataRows: rest.map(l => l.split('\t').map(c => c.trim())),
		};
	}

	/**
	 * The positional data columns the import maps onto: Name first, then non-locked columns — the
	 * exact inverse of the export set, minus #.
	 */
	private nonLockedColumns(): CustomListColumn[] {
		return this.list.columns.filter(c => !c.locked);
	}

	private analyse(): ImportAnalysis | null {
		const parsed = this.parse();
		if (!parsed || parsed.dataRows.length === 0) return null;

		const nonLocked = this.nonLockedColumns();
		const existingCount = 1 + nonLocked.length; // Name + non-locked columns
		const totalCols = Math.max(
			parsed.header.length,
			...parsed.dataRows.map(r => r.length),
		);
		const newColCount = Math.max(0, totalCols - existingCount);

		const numberConflicts = new Set<string>();
		const selectNewValues = new Map<number, { label: string; values: Set<string> }>();

		for (const row of parsed.dataRows) {
			for (let i = 1; i < row.length && i < existingCount; i++) {
				const col = nonLocked[i - 1]!; // i === 0 is Name (text, no conflict)
				const cell = row[i]!;
				if (cell === '') continue;
				if (col.type === 'number') {
					if (!Number.isFinite(Number(cell))) numberConflicts.add(col.label || '(unnamed)');
				} else if (col.type === 'select') {
					const known = new Set(col.options ?? []);
					if (!known.has(cell)) {
						let entry = selectNewValues.get(i);
						if (!entry) { entry = { label: col.label || '(unnamed)', values: new Set() }; selectNewValues.set(i, entry); }
						entry.values.add(cell);
					}
				}
			}
		}

		return {
			header: parsed.header,
			dataRows: parsed.dataRows,
			rowCount: parsed.dataRows.length,
			totalCols,
			existingCount,
			newColCount,
			selectAdditions: [...selectNewValues.values()].map(e => ({ label: e.label, values: [...e.values] })),
			numberConflicts: [...numberConflicts],
		};
	}

	private refreshPreview(): void {
		this.previewEl.empty();
		const a = this.analyse();

		if (!a) {
			this.addBtn.disabled = true;
			this.previewEl.createDiv({ cls: 'hoard-import-counts', text: t('lists.pasteToPreview') });
			return;
		}

		this.previewEl.createDiv({
			cls: 'hoard-import-counts',
			text: t('lists.detected', {
				rows: t('lists.rowCount', { count: a.rowCount }),
				cols: t('lists.columnCount', { count: a.totalCols }),
			}),
		});

		const blocking = a.numberConflicts.length > 0;

		if (a.newColCount > 0) {
			this.previewEl.createDiv({
				cls: 'hoard-import-banner',
				text: `⚠ ${t('lists.newTextColumns', { count: a.newColCount })}`,
			});
		}

		for (const sel of a.selectAdditions) {
			this.previewEl.createDiv({
				cls: 'hoard-import-banner',
				text: `⚠ ${t('lists.selectGain', { label: sel.label, count: sel.values.length, values: sel.values.join(', ') })}`,
			});
		}

		if (a.totalCols < a.existingCount) {
			this.previewEl.createDiv({
				cls: 'hoard-import-banner',
				text: `⚠ ${t('lists.fewerColumns')}`,
			});
		}

		for (const label of a.numberConflicts) {
			this.previewEl.createDiv({
				cls: 'hoard-import-banner-error',
				text: `⛔ ${t('lists.numberConflict', { label })}`,
			});
		}

		this.addBtn.disabled = blocking;
	}

	private async apply(): Promise<void> {
		const a = this.analyse();
		if (!a || a.numberConflicts.length > 0) return;

		const nonLocked = this.nonLockedColumns();
		const newCols = this.appendMissingColumns(a);
		// positional slots: index 0 = Name, then non-locked columns, then new columns
		const slots: ImportSlot[] = ['name', ...nonLocked, ...newCols];
		this.addSelectOptions(a.selectAdditions, nonLocked);
		this.appendParsedRows(a, slots);

		this.close();
		await this.onApplied();
		new Notice(t('lists.imported', { count: a.rowCount }));
	}

	/** Auto-creates the missing trailing text columns. */
	private appendMissingColumns(a: ImportAnalysis): CustomListColumn[] {
		const list = this.list;
		const newCols: CustomListColumn[] = [];
		for (let pos = a.existingCount; pos < a.totalCols; pos++) {
			const label = (a.header[pos] ?? '').trim() || `Column ${pos + 1}`;
			const col: CustomListColumn = {
				id: this.manager.generateColId(list.columns),
				label,
				type: 'text',
				bold: false,
				italic: false,
			};
			list.columns.push(col);
			newCols.push(col);
		}
		return newCols;
	}

	/** Adds any new select options encountered (text only, no colour). */
	private addSelectOptions(additions: ImportAnalysis['selectAdditions'], nonLocked: CustomListColumn[]): void {
		for (const sel of additions) {
			const col = nonLocked.find(c => (c.label || '(unnamed)') === sel.label && c.type === 'select');
			if (!col) continue;
			col.options = [...(col.options ?? [])];
			for (const v of sel.values) if (!col.options.includes(v)) col.options.push(v);
		}
	}

	/** Appends the parsed rows as NEW rows (never touches existing rows). */
	private appendParsedRows(a: ImportAnalysis, slots: ImportSlot[]): void {
		const list = this.list;
		for (const cells of a.dataRows) {
			const row: CustomListRow = { id: this.manager.generateRowId(list.rows), name: '' };
			list.rows.push(row); // push first so the next generated id stays unique
			for (let i = 0; i < a.totalCols; i++) {
				const slot = slots[i];
				if (slot) ImportListModal.fillCell(row, slot, (cells[i] ?? '').trim());
			}
		}
	}

	private static fillCell(row: CustomListRow, slot: ImportSlot, cell: string): void {
		if (slot === 'name') {
			row.name = cell;
		} else if (cell === '') {
			row[slot.id] = undefined;
		} else {
			row[slot.id] = slot.type === 'number' ? Number(cell) : cell;
		}
	}
}
