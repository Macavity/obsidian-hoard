import type { EventRef, FileManager, TAbstractFile, TFile, Vault } from 'obsidian';
import {
	deleteEntryNote,
	ensureFolder,
	freeNotePath,
	noteFile,
	parentOf,
	registerRenameFollow,
	trashNote,
	updateFrontMatter,
	writeEntry,
} from '../storage/noteWrite';
import type { EntryWriteHooks, HeldEntries, Slot, WriteOutcome } from '../storage/noteWrite';
import type { EntryKind, Notify } from '../storage/storageTypes';
import type { VaultLayout } from '../storage/VaultLayout';

/** A note path picked for a new entry, with the id it will have. */
export interface NoteSlot {
	path: string;
	id: string;
}

/**
 * The notes of the entries (titles, books, manga, games) in the vault: where they live, and reading,
 * creating, rewriting, renaming and trashing them. The data managers decide what goes into a note;
 * this does the vault work, so each of them holds one collaborator instead of the vault plumbing.
 */
export class EntryNotes {
	constructor(
		private readonly vault: Vault,
		private readonly fileManager: FileManager,
		private readonly layout: () => VaultLayout,
		private readonly notify: Notify,
		/** Bound to the plugin, so the handlers are removed on unload. */
		private readonly registerEvent: (ref: EventRef) => void,
	) {}

	// Where notes live

	/** The folder the layout is rooted at. */
	get root(): string {
		return this.layout().root;
	}

	folderFor(kind: EntryKind, type?: string): string {
		return this.layout().folderFor(kind, type);
	}

	/** Path a new note of this kind and title would get. */
	pathFor(kind: EntryKind, title: string, type?: string): string {
		return this.layout().notePath(kind, title, type);
	}

	pathOf(id: string): string {
		return this.layout().pathFromId(id);
	}

	idOf(path: string): string {
		return this.layout().idFromPath(path);
	}

	/** Kind, id and type of the note at a path; null for anything else. */
	classify(path: string): ReturnType<VaultLayout['classify']> {
		return this.layout().classify(path);
	}

	/** True when something (a note or a folder) is at the path. */
	exists(path: string): boolean {
		return this.vault.getAbstractFileByPath(path) !== null;
	}

	/** The note file of an id, or null. */
	fileOf(id: string): TFile | null {
		return noteFile(this.vault, this.pathOf(id));
	}

	// Reading and changing

	read(file: TFile): Promise<string> {
		return this.vault.read(file);
	}

	cachedRead(file: TFile): Promise<string> {
		return this.vault.cachedRead(file);
	}

	/** Rewrites the file's text; `fn` gets the current content. */
	process(file: TFile, fn: (content: string) => string): Promise<string> {
		return this.vault.process(file, fn);
	}

	/** Changes the properties of a note; false (and a notice) when its YAML cannot be read. */
	updateProperties(file: TFile, fn: (fm: Record<string, unknown>) => void): Promise<boolean> {
		return updateFrontMatter(this.fileManager, file, this.notify, fn);
	}

	// Creating, writing, removing

	async ensureFolder(path: string): Promise<void> {
		await ensureFolder(this.vault, path);
	}

	/** The id a new note of this kind and title would get. */
	nextId(kind: EntryKind, title: string, type?: string): string {
		return this.idOf(freeNotePath(this.vault, this.pathFor(kind, title, type)));
	}

	/** Picks the first free path for a new note and makes sure its folder exists. */
	async reserve(kind: EntryKind, title: string, type?: string): Promise<NoteSlot> {
		const path = freeNotePath(this.vault, this.pathFor(kind, title, type));
		await ensureFolder(this.vault, parentOf(path));
		return { path, id: this.idOf(path) };
	}

	async create(path: string, content: string): Promise<void> {
		await this.vault.create(path, content);
	}

	/** Writes an entry to its note through the shared pipeline; the hooks say how the manager's state follows. */
	write<T extends { id: string }>(hooks: EntryWriteHooks<T>, entry: T): Promise<WriteOutcome> {
		return writeEntry({ vault: this.vault, fileManager: this.fileManager, layout: this.layout, notify: this.notify }, hooks, entry);
	}

	/** Trashes the note of an id and forgets everything the manager holds for it. */
	async remove<S extends Slot>(held: HeldEntries<S>, id: string): Promise<void> {
		await deleteEntryNote(this.vault, this.fileManager, this.layout(), held, id);
	}

	/** Trashes the note of an id, when there is one. */
	async trash(id: string): Promise<void> {
		await trashNote(this.vault, this.fileManager, this.pathOf(id));
	}

	// Following the vault

	/** Re-keys what the manager holds when a note with a pending edit is renamed in the vault. */
	followRenames<S extends Slot>(held: HeldEntries<S>): void {
		registerRenameFollow(this.vault, this.registerEvent, held, this.layout);
	}

	/** Calls `onChange` for every modified or created file and `onRename` for every rename. */
	watch(onChange: (file: TAbstractFile) => void, onRename: (file: TAbstractFile, oldPath: string) => void): void {
		this.registerEvent(this.vault.on('modify', onChange));
		this.registerEvent(this.vault.on('create', onChange));
		this.registerEvent(this.vault.on('rename', onRename));
	}
}
