import { normalizePath, type App, type TFile } from 'obsidian';
import { FOLDERS, type VaultLayout } from '../../storage/VaultLayout';

const inside = (path: string, folder: string): boolean => folder === '' || path === folder || path.startsWith(`${folder}/`);

/** Folders a layout manages below its root: one per type plus the book, manga, game and list folders. */
export function managedFolders(layout: VaultLayout, typeNames: string[]): string[] {
	const rel = [...typeNames, FOLDERS.book, FOLDERS.manga, FOLDERS.game, FOLDERS.customLists];
	return [...new Set(rel.map((r) => normalizePath(layout.root ? `${layout.root}/${r}` : r)))];
}

/**
 * Every file (any extension, also in subfolders) inside the managed folders of `layout`, plus its
 * history file; nothing below `exclude` (Hoard's own root when it lies inside the WatchLog root).
 */
export function managedFiles(app: App, layout: VaultLayout, typeNames: string[], exclude: string): TFile[] {
	const folders = managedFolders(layout, typeNames);
	return app.vault.getFiles()
		.filter((f) => !inside(f.path, exclude))
		.filter((f) => f.path === layout.historyPath || folders.some((d) => f.path.startsWith(`${d}/`)))
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
