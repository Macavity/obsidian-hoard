import { TFile, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { Fm, Notify } from './storageTypes';
import type { VaultLayout } from './VaultLayout';
import { setBaseline } from './baseline';
import { changedKeys } from './sharedHelpers';

/** processFrontMatter that reports unreadable YAML as a notice and returns false instead of throwing. */
export async function updateFrontMatter(
	app: App,
	file: TFile,
	notify: Notify,
	fn: (fm: Record<string, unknown>) => void,
): Promise<boolean> {
	try {
		await app.fileManager.processFrontMatter(file, fn);
		return true;
	} catch (e) {
		console.warn(`Hoard: could not update frontmatter of ${file.path}`, e);
		notify({ code: 'invalidYaml', file: file.basename });
		return false;
	}
}

/** True when `target` is free for a rename; otherwise reports it (the note keeps its old name). */
function renameTargetFree(app: App, target: string, notify: Notify): boolean {
	if (!app.vault.getAbstractFileByPath(target)) return true;
	notify({ code: 'renameTargetExists', target });
	return false;
}

/** The note file at a vault path, or null (a folder, or nothing). */
export function noteFile(app: App, path: string): TFile | null {
	const f = app.vault.getAbstractFileByPath(path);
	return f instanceof TFile ? f : null;
}

/** First free `<name>.md`, `<name> 2.md`, … */
export function freeNotePath(app: App, path: string): string {
	if (!app.vault.getAbstractFileByPath(path)) return path;
	const base = path.slice(0, -3);
	let n = 2;
	while (app.vault.getAbstractFileByPath(`${base} ${n}.md`)) n++;
	return `${base} ${n}.md`;
}

export function parentOf(path: string): string {
	const i = path.lastIndexOf('/');
	return i < 0 ? '' : path.slice(0, i);
}

/** Creates the folder when it is missing; one that appeared in the meantime is fine. */
export async function ensureFolder(app: App, path: string): Promise<void> {
	const normalized = normalizePath(path);
	if (!normalized || normalized === '/') return;
	if (app.vault.getAbstractFileByPath(normalized)) return;
	try {
		await app.vault.createFolder(normalized);
	} catch {
		// folder may already exist
	}
}

/** Moves the note at the path to the trash, when there is one. */
export async function trashNote(app: App, path: string): Promise<void> {
	const file = noteFile(app, path);
	if (file) await app.fileManager.trashFile(file);
}

/** Sets the changed keys that the encoded entry has and deletes the ones it lacks. */
export function setChangedKeys(raw: Fm, changed: string[], after: Fm): void {
	for (const key of changed) {
		if (key in after) raw[key] = after[key];
		else delete raw[key];
	}
}

/**
 * Full rewrite of the plugin's own keys: a key the encoder gives is set, one it omits is deleted.
 * A key in `keep` (the decoder could not read it) is left alone, and only filled when the note lacks it.
 */
export function rewriteOwnedKeys(raw: Fm, keys: Iterable<string>, out: Fm, keep: ReadonlySet<string>): void {
	for (const key of keys) {
		if (key in out) {
			if (!keep.has(key) || !(key in raw)) raw[key] = out[key];
		} else if (!keep.has(key)) {
			delete raw[key];
		}
	}
}

/**
 * What a rename re-keys in a manager that holds an index entry, a view and a pending flag per id:
 * entry and view of the old id are dropped (the next read builds them under the new id), a pending
 * silent edit follows to the new id.
 */
export function dropOldId(
	held: { index: { removeLocal(id: string): void }; views: Map<string, unknown>; dirty: Set<string> },
	from: string,
	to: string,
): void {
	held.index.removeLocal(from);
	held.views.delete(from);
	if (held.dirty.delete(from)) held.dirty.add(to);
}

/** What a manager tells the write pipeline about its kind of entry. */
export interface EntryWriteHooks<T extends { id: string }> {
	/** Stored state the copy was made from, when known. */
	baselineOf(entry: T): T | undefined;
	/** The path the note belongs at now, when the edit against `src` moves it; else null. */
	movedPath(src: T, entry: T): string | null;
	/** Re-keys what the manager holds per id. The pipeline sets `entry.id` itself, after this. */
	moveId(from: string, to: string): void;
	/** Readies the entry for this write and returns the encoder used for both sides of the diff. */
	prepare(entry: T, src: T | undefined): (x: T) => Fm;
	/** Index, cache and view bookkeeping of an own write; runs inside the frontmatter callback. */
	afterWrite(entry: T, fm: Fm): void;
	/** True when `entry` is the copy the manager hands out. */
	isLiveCopy(entry: T): boolean;
	/** Nothing to write: the manager settles the copy by its own rule. */
	unchanged(entry: T, src: T | undefined): void;
	/** Creates the note of an entry that has none. */
	create(entry: T): Promise<void>;
}

export type WriteOutcome = 'created' | 'written' | 'unchanged' | 'unreadable';

export interface NoteIo {
	app: App;
	layout: () => VaultLayout;
	notify: Notify;
}

/**
 * Moves the note when the edit moves it and the target is free, and gives the entry its new id.
 * Returns the file to write to: the moved one, or the old one when nothing moved.
 */
async function moveNote<T extends { id: string }>(io: NoteIo, hooks: EntryWriteHooks<T>, file: TFile, src: T, entry: T): Promise<TFile> {
	const target = hooks.movedPath(src, entry);
	if (target === null || target === file.path || !renameTargetFree(io.app, target, io.notify)) return file;
	await ensureFolder(io.app, parentOf(target));
	await io.app.fileManager.renameFile(file, target);
	const to = io.layout().idFromPath(target);
	hooks.moveId(entry.id, to);
	entry.id = to;
	return noteFile(io.app, io.layout().pathFromId(to)) ?? file;
}

/**
 * Writes an entry to its note: moves the file when the edit moves it, then sets only the properties
 * whose encoded value differs from the stored state the copy was made from, so unreadable or foreign
 * properties stay untouched unless this edit changes exactly that one. A note that does not exist
 * is created by the manager.
 */
export async function writeEntry<T extends { id: string }>(io: NoteIo, hooks: EntryWriteHooks<T>, entry: T): Promise<WriteOutcome> {
	const found = noteFile(io.app, io.layout().pathFromId(entry.id));
	if (!found) {
		await hooks.create(entry);
		return 'created';
	}
	const src = hooks.baselineOf(entry);
	const file = src ? await moveNote(io, hooks, found, src, entry) : found;
	const encode = hooks.prepare(entry, src);
	const after = encode(entry);
	const changed = changedKeys(src ? encode(src) : {}, after);
	if (changed.length === 0) {
		hooks.unchanged(entry, src);
		return 'unchanged';
	}
	const ok = await updateFrontMatter(io.app, file, io.notify, (raw) => {
		setChangedKeys(raw, changed, after);
		// inside the callback, so the index is ahead of the write's `changed` event
		hooks.afterWrite(entry, { ...raw });
	});
	if (!ok) return 'unreadable';
	// a stale copy (not taken as the view) holds what the note holds for every field it knows
	if (!hooks.isLiveCopy(entry)) setBaseline(entry, structuredClone(entry));
	return 'written';
}
