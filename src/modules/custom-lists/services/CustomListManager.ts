import { normalizePath, TFile, type FileManager, type Vault } from 'obsidian';
import type { CustomList } from '../domain/customList';
import type { CustomListColumn, CustomListRow } from '../../../shared/domain/columns';
import { at } from '../../../shared/domain/read';
import type { VaultLayout } from '../../../shared/storage/VaultLayout';

// Vault I/O of the custom lists (the UI gets an instance injected)

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
		private readonly vault: Vault,
		private readonly fileManager: Pick<FileManager, 'trashFile'>,
		private readonly layout: () => Pick<VaultLayout, 'customListsFolder'>,
		/** A list file's data block is unreadable; the UI tells the user. */
		private readonly onCorrupt: (name: string) => void,
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
		const file = this.vault.getAbstractFileByPath(this.pathOf(name));
		if (!(file instanceof TFile)) return undefined;
		return this.parse(name, await this.vault.read(file), false);
	}

	/**
	 * Rewrites the note through `transform` only if it still holds the baseline of `list`;
	 * returns false (note untouched) on a foreign change.
	 */
	private async writeChecked(list: CustomList, file: TFile, transform: (data: string) => string): Promise<boolean> {
		let written = false;
		await this.vault.process(file, (data) => {
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
		return this.layout().customListsFolder;
	}

	async ensureFolder(): Promise<void> {
		const path = normalizePath(this.folderPath);
		if (!this.vault.getAbstractFileByPath(path)) {
			try { await this.vault.createFolder(path); } catch { /* ok */ }
		}
	}

	listNames(): string[] {
		const dir = normalizePath(this.folderPath);
		return this.vault.getFiles()
			.filter(f => {
				const parentPath = f.parent?.path ?? '';
				return parentPath === dir && f.extension === 'md';
			})
			.map(f => f.basename)
			.sort((a, b) => a.localeCompare(b));
	}

	async loadList(name: string): Promise<CustomList | null> {
		const path = normalizePath(`${this.folderPath}/${name}.md`);
		const file = this.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		try {
			const list = this.parse(name, await this.vault.read(file));
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
				const p: unknown = JSON.parse(dataMatch[1]);
				const color = at(p, 'tabColor');
				if (typeof color === 'string') tabColor = color;
				const width = at(p, 'nameWidth');
				if (typeof width === 'number') nameWidth = width;
				const cols = at(p, 'columns');
				if (Array.isArray(cols)) {
					columns = cols.filter((c): c is CustomListColumn =>
						typeof c === 'object' && c !== null &&
						'id' in c && 'label' in c && 'type' in c,
					);
				}
				const rawRows = at(p, 'rows');
				if (Array.isArray(rawRows)) {
					rows = rawRows.filter((r): r is CustomListRow =>
						typeof r === 'object' && r !== null && 'id' in r,
					);
				}
			} catch (e) {
				if (!report) return null;
				console.warn('[Hoard] Custom list JSON parse failed for', name, e);
				this.onCorrupt(name);
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
			const existing = this.vault.getAbstractFileByPath(path);
			if (existing instanceof TFile) {
				return this.writeChecked(list, existing, (data) => replaceDataBlock(data, this.dataJson(list)));
			}
			if (this.baselines.has(list)) {
				// deleted or renamed elsewhere: recreating it would undo that
				this.onConflict(list);
				return false;
			}
			const content = this.serialize(list);
			await this.vault.create(path, content);
			const created = this.parse(list.name, content);
			if (created) this.baselines.set(list, this.stateKey(created));
			return true;
		});
	}

	/** Saves only the ## Notes section, without touching ## Data JSON. */
	async saveNotes(list: CustomList, notes: string): Promise<boolean> {
		return this.saveSerialized(list.name, async () => {
			const file = this.vault.getAbstractFileByPath(this.pathOf(list.name));
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
		const file = this.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			try { await this.fileManager.trashFile(file); } catch { /* ok */ }
		}
	}

	async renameList(oldName: string, newName: string): Promise<void> {
		const newPath = normalizePath(`${this.folderPath}/${newName}.md`);
		const oldPath = normalizePath(`${this.folderPath}/${oldName}.md`);
		const file = this.vault.getAbstractFileByPath(oldPath);
		if (file instanceof TFile) {
			try { await this.vault.rename(file, newPath); } catch { /* ok */ }
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
