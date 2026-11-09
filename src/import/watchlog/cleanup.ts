import { TFile, TFolder, type App } from 'obsidian';
import { VaultLayout } from '../../storage/VaultLayout';
import type { EntryKind } from '../../storage/storageTypes';
import { hasHoardKey } from '../../storage/baseFile';
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

async function readPath(app: App, path: string): Promise<string | null> {
	const f = app.vault.getAbstractFileByPath(path);
	return f instanceof TFile ? app.vault.cachedRead(f) : null;
}

/**
 * A source is safe to trash only when Hoard holds it as another file with the same content (`part`
 * picks what counts): a differing copy was kept on import, so the source still holds data.
 */
async function copied(app: App, source: string, target: string, part: (s: string) => string = (s) => s): Promise<boolean> {
	if (source === target) return false;
	const [a, b] = await Promise.all([readPath(app, source), readPath(app, target)]);
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
async function originalLists(app: App, folder: string, layout: VaultLayout): Promise<string[]> {
	const paths: string[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.parent?.path !== folder || !isListNote(await app.vault.cachedRead(file))) continue;
		if (await copied(app, file.path, `${layout.customListsFolder}/${file.name}`)) paths.push(file.path);
	}
	return paths;
}

async function originalNotes(app: App, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const data = sources.original?.data;
	if (!data) return [];
	// new notes take WatchLog's body; its frontmatter lives on in data.json
	const paths: string[] = [];
	for (const [orig, hoard] of originalPairs(data, layout)) if (await copied(app, orig, hoard, bodyOf)) paths.push(orig);
	return sortUnique([...paths, ...await originalLists(app, originalFolders(data).lists, layout)]);
}

async function forkNotes(app: App, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const fork = sources.fork;
	if (!fork) return [];
	const forkLayout = new VaultLayout(fork.root, () => fork.typeNames);
	const paths: string[] = [];
	for (const f of managedFiles(app, forkLayout, fork.typeNames, nestedHoardRoot(fork.root, layout.root))) {
		if (await copied(app, f.path, forkTarget(f.path, fork.root, layout.root))) paths.push(f.path);
	}
	return sortUnique(paths);
}

async function forkBase(app: App, sources: WatchLogSources): Promise<string[]> {
	const base = sources.fork?.base;
	if (!base) return [];
	for (const f of app.vault.getFiles()) {
		if (f.extension === 'base' && f.path !== base.path && hasHoardKey(await app.vault.cachedRead(f))) return [base.path];
	}
	return [];
}

async function widgetNotes(app: App): Promise<string[]> {
	const paths: string[] = [];
	for (const f of app.vault.getMarkdownFiles()) if (hasWidgetFence(await app.vault.cachedRead(f))) paths.push(f.path);
	return sortUnique(paths);
}

/** What cleanup could remove after an import; steps without files are left out. Read-only. */
export async function planCleanup(
	app: App, sources: WatchLogSources, layout: VaultLayout, imported: WatchLogSourceKind[],
): Promise<CleanupItem[]> {
	const has = (k: WatchLogSourceKind): boolean => imported.includes(k);
	const items: CleanupItem[] = [
		{ id: 'original-notes', paths: has('original') ? await originalNotes(app, sources, layout) : [] },
		{ id: 'fork-notes', paths: has('fork') ? await forkNotes(app, sources, layout) : [] },
		{ id: 'fork-base', paths: has('fork') ? await forkBase(app, sources) : [] },
		{ id: 'widgets', paths: imported.length ? await widgetNotes(app) : [] },
	];
	return items.filter((i) => i.paths.length > 0);
}

/** Trashes now-empty folders above `path`, stopping at the Hoard root, its parents and the vault root. */
async function trashEmptyParents(app: App, path: string, root: string): Promise<void> {
	let dir = dirOf(path);
	while (dir && root && dir !== root && !root.startsWith(`${dir}/`)) {
		const folder = app.vault.getAbstractFileByPath(dir);
		if (!(folder instanceof TFolder) || folder.children.length > 0) return;
		await app.fileManager.trashFile(folder);
		dir = dirOf(dir);
	}
}

/** Runs the chosen cleanup steps; per-file errors are collected and the rest continues. */
export async function runCleanup(app: App, items: CleanupItem[], layout: VaultLayout): Promise<{ done: number; errors: string[] }> {
	let done = 0;
	const errors: string[] = [];
	const fail = (path: string, e: unknown): void => { errors.push(`${path}: ${e instanceof Error ? e.message : String(e)}`); };
	for (const item of items) {
		for (const path of item.paths) {
			const file = app.vault.getAbstractFileByPath(path) as TFile | null;
			if (!file) continue;
			try {
				if (item.id === 'widgets') await app.vault.process(file, rewriteWidgetFences);
				else {
					await app.fileManager.trashFile(file);
					await trashEmptyParents(app, path, layout.root);
				}
				done++;
			} catch (e) { fail(path, e); }
		}
	}
	return { done, errors };
}

