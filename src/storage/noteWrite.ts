import { TFile, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type { Notify } from './storageTypes';

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
export function renameTargetFree(app: App, target: string, notify: Notify): boolean {
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
