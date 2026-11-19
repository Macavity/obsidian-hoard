import { TFile, TFolder, type FileManager, type Vault } from 'obsidian';
import { VaultLayout } from '../../../../shared/storage/VaultLayout';
import type { EntryKind } from '../../../../shared/storage/storageTypes';
import { renameTopLevelBlock, replaceInFolderPath } from '../../../../shared/storage/baseFile';
import type { WatchLogSourceKind, WatchLogSources } from './detect';
import { isListNote, originalFolders, originalNotePath } from './originalPaths';
import { forkTarget, managedFiles, nestedHoardRoot } from './paths';
import { bodyOf } from './schema1Notes';
import type { WatchLogData } from './schema1Types';
import { hasWidgetFence, rewriteWidgetFences } from './widgets';

/** One optional cleanup step and the files it would touch. */
export interface CleanupItem {
	id: 'original-notes' | 'fork-notes' | 'fork-base' | 'widgets';
	paths: string[];
}

const sortUnique = (paths: string[]): string[] => [...new Set(paths)].sort();
const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

async function readPath(vault: Vault, path: string): Promise<string | null> {
	const f = vault.getAbstractFileByPath(path);
	return f instanceof TFile ? vault.cachedRead(f) : null;
}

/**
 * A source is safe to trash only when Hoard holds it as another file with the same content (`part`
 * picks what counts): a differing copy was kept on import, so the source still holds data.
 */
async function copied(vault: Vault, source: string, target: string, part: (s: string) => string = (s) => s): Promise<boolean> {
	if (source === target) return false;
	const [a, b] = await Promise.all([readPath(vault, source), readPath(vault, target)]);
	return a !== null && b !== null && part(a).trim() === part(b).trim();
}

/** Each WatchLog entry's note path paired with the path of its Hoard note. */
function originalPairs(data: WatchLogData, layout: VaultLayout): [string, string][] {
	const f = originalFolders(data);
	const pairs: [string, string][] = data.titles.map((t) => [originalNotePath(f, 'title', t.title, t.type), layout.notePath('title', t.title, t.type)]);
	const others: [EntryKind, { title: string }[] | undefined][] = [
		['book', data.reading?.books], ['manga', data.reading?.manga], ['game', data.games?.games],
	];
	for (const [kind, items] of others) {
		for (const { title } of items ?? []) pairs.push([originalNotePath(f, kind, title), layout.notePath(kind, title)]);
	}
	return pairs;
}

/** WatchLog's custom lists that Hoard holds as identical copies. */
async function originalLists(vault: Vault, folder: string, layout: VaultLayout): Promise<string[]> {
	const paths: string[] = [];
	for (const file of vault.getMarkdownFiles()) {
		if (file.parent?.path !== folder || !isListNote(await vault.cachedRead(file))) continue;
		if (await copied(vault, file.path, `${layout.customListsFolder}/${file.name}`)) paths.push(file.path);
	}
	return paths;
}

async function originalNotes(vault: Vault, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const data = sources.original?.data;
	if (!data) return [];
	// new notes take WatchLog's body; its frontmatter lives on in data.json
	const paths: string[] = [];
	for (const [orig, hoard] of originalPairs(data, layout)) if (await copied(vault, orig, hoard, bodyOf)) paths.push(orig);
	return sortUnique([...paths, ...await originalLists(vault, originalFolders(data).lists, layout)]);
}

async function forkNotes(vault: Vault, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const fork = sources.fork;
	if (!fork) return [];
	const forkLayout = new VaultLayout(fork.root, () => fork.typeNames);
	const paths: string[] = [];
	for (const f of managedFiles(vault, forkLayout, fork.typeNames, nestedHoardRoot(fork.root, layout.root))) {
		if (await copied(vault, f.path, forkTarget(f.path, fork.root, layout.root))) paths.push(f.path);
	}
	return sortUnique(paths);
}

/**
 * The fork base, only when Hoard's base is its copy (renamed key, folder filter set to Hoard's root):
 * a Hoard base that already existed keeps its own views and settings, so the fork's would be lost.
 */
async function forkBase(vault: Vault, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const base = sources.fork?.base;
	if (!base || layout.basePath === base.path) return [];
	const renamed = renameTopLevelBlock(await vault.cachedRead(base), 'watchlog', 'hoard');
	const expected = replaceInFolderPath(renamed, layout.root) ?? renamed;
	const hoard = await readPath(vault, layout.basePath);
	return hoard !== null && hoard.trim() === expected.trim() ? [base.path] : [];
}

async function widgetNotes(vault: Vault): Promise<string[]> {
	const paths: string[] = [];
	for (const f of vault.getMarkdownFiles()) if (hasWidgetFence(await vault.cachedRead(f))) paths.push(f.path);
	return sortUnique(paths);
}

/** What cleanup could remove after an import; steps without files are left out. Read-only. */
export async function planCleanup(
	vault: Vault, sources: WatchLogSources, layout: VaultLayout, imported: WatchLogSourceKind[],
): Promise<CleanupItem[]> {
	const has = (k: WatchLogSourceKind): boolean => imported.includes(k);
	const items: CleanupItem[] = [
		{ id: 'original-notes', paths: has('original') ? await originalNotes(vault, sources, layout) : [] },
		{ id: 'fork-notes', paths: has('fork') ? await forkNotes(vault, sources, layout) : [] },
		{ id: 'fork-base', paths: has('fork') ? await forkBase(vault, sources, layout) : [] },
		{ id: 'widgets', paths: imported.length ? await widgetNotes(vault) : [] },
	];
	return items.filter((i) => i.paths.length > 0);
}

/** Trashes now-empty folders above `path`, stopping at the Hoard root, its parents and the vault root. */
async function trashEmptyParents(vault: Vault, fileManager: Pick<FileManager, 'trashFile'>, path: string, root: string): Promise<void> {
	let dir = dirOf(path);
	while (dir && root && dir !== root && !root.startsWith(`${dir}/`)) {
		const folder = vault.getAbstractFileByPath(dir);
		if (!(folder instanceof TFolder) || folder.children.length > 0) return;
		await fileManager.trashFile(folder);
		dir = dirOf(dir);
	}
}

/** Cleans one planned path; `fail` collects its errors. True when the file itself was handled. */
async function cleanOne(vault: Vault, fileManager: Pick<FileManager, 'trashFile'>, id: CleanupItem['id'], path: string, root: string, fail: (p: string, e: unknown) => void): Promise<boolean> {
	// a folder (replaced by sync meanwhile) is never trashed with its unreviewed contents
	const file = vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return false;
	try {
		if (id === 'widgets') {
			await vault.process(file, rewriteWidgetFences);
			return true;
		}
		await fileManager.trashFile(file);
	} catch (e) {
		fail(path, e);
		return false;
	}
	// an empty folder left behind is cosmetic: its failure is reported, the note counts as done
	await trashEmptyParents(vault, fileManager, path, root).catch((e: unknown) => fail(dirOf(path), e));
	return true;
}

/** Runs the chosen cleanup steps; per-file errors are collected and the rest continues. */
export async function runCleanup(vault: Vault, fileManager: Pick<FileManager, 'trashFile'>, items: CleanupItem[], layout: VaultLayout): Promise<{ done: number; errors: string[] }> {
	let done = 0;
	const errors: string[] = [];
	const fail = (path: string, e: unknown): void => { errors.push(`${path}: ${e instanceof Error ? e.message : String(e)}`); };
	for (const item of items) {
		for (const path of item.paths) if (await cleanOne(vault, fileManager, item.id, path, layout.root, fail)) done++;
	}
	return { done, errors };
}
