import { normalizePath, type App, type TFile } from 'obsidian';
import { FOLDERS, type VaultLayout } from '../../storage/VaultLayout';

// '' (Hoard at the vault root) excludes nothing: a nested fork is never below it in the managed sense
const inside = (path: string, folder: string): boolean => folder !== '' && (path === folder || path.startsWith(`${folder}/`));

const below = (layout: VaultLayout, rel: string[]): string[] =>
	[...new Set(rel.map((r) => normalizePath(layout.root ? `${layout.root}/${r}` : r)))];

/** Folders that hold entry notes (one per type plus the book, manga and game folders); no custom lists. */
export function entryFolders(layout: VaultLayout, typeNames: string[]): string[] {
	return below(layout, [...typeNames, FOLDERS.book, FOLDERS.manga, FOLDERS.game]);
}

/** Folders a layout manages below its root: the entry folders plus the custom list folder. */
export function managedFolders(layout: VaultLayout, typeNames: string[]): string[] {
	return below(layout, [...typeNames, FOLDERS.book, FOLDERS.manga, FOLDERS.game, FOLDERS.customLists]);
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

/** Hoard's root when it lies strictly inside the fork root (its files must not be copied onto themselves), else ''. */
export function nestedHoardRoot(forkRoot: string, hoardRoot: string): string {
	return hoardRoot !== forkRoot && (forkRoot === '' || hoardRoot.startsWith(`${forkRoot}/`)) ? hoardRoot : '';
}

/** Where a fork file lands below Hoard's root: same path relative to the respective root. */
export function forkTarget(path: string, forkRoot: string, hoardRoot: string): string {
	const rel = forkRoot ? path.slice(forkRoot.length + 1) : path;
	return normalizePath(hoardRoot ? `${hoardRoot}/${rel}` : rel);
}
