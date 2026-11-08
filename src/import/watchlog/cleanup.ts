import { TFolder, type App, type TFile } from 'obsidian';
import { VaultLayout } from '../../storage/VaultLayout';
import type { EntryKind } from '../../storage/storageTypes';
import { hasHoardKey } from '../../storage/baseFile';
import type { WatchLogSourceKind, WatchLogSources } from './detect';
import { originalFolders, originalNotePath } from './originalPaths';
import { managedFiles } from './paths';
import { hasWidgetFence, rewriteWidgetFences } from './widgets';

/** One optional cleanup step and the files it would touch. */
export interface CleanupItem {
	id: 'original-notes' | 'fork-notes' | 'fork-base' | 'widgets';
	paths: string[];
}

const LIST_DATA = /## Data\s*```json/;
const sortUnique = (paths: string[]): string[] => [...new Set(paths)].sort();
const exists = (app: App, path: string): boolean => app.vault.getAbstractFileByPath(path) !== null;
const dirOf = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

async function originalNotes(app: App, sources: WatchLogSources, layout: VaultLayout): Promise<string[]> {
	const data = sources.original?.data;
	if (!data) return [];
	const f = originalFolders(data);
	const pairs: [string, string][] = [];
	for (const t of data.titles) pairs.push([originalNotePath(f, 'title', t.title, t.type), layout.notePath('title', t.title, t.type)]);
	const others: [EntryKind, string[]][] = [
		['book', (data.reading?.books ?? []).map((b) => b.title)],
		['manga', (data.reading?.manga ?? []).map((b) => b.title)],
		['game', (data.games?.games ?? []).map((g) => g.title)],
	];
	for (const [kind, titles] of others) for (const t of titles) pairs.push([originalNotePath(f, kind, t), layout.notePath(kind, t)]);
	const paths = pairs.filter(([orig, hoard]) => exists(app, orig) && exists(app, hoard)).map(([orig]) => orig);
	for (const file of app.vault.getMarkdownFiles()) {
		if (file.parent?.path !== f.lists || !LIST_DATA.test(await app.vault.cachedRead(file))) continue;
		if (exists(app, `${layout.customListsFolder}/${file.name}`)) paths.push(file.path);
	}
	return sortUnique(paths);
}

function forkNotes(app: App, sources: WatchLogSources, layout: VaultLayout): string[] {
	const fork = sources.fork;
	if (!fork) return [];
	const forkLayout = new VaultLayout(fork.root, () => fork.typeNames);
	const prefix = fork.root ? `${fork.root}/` : '';
	return sortUnique(
		managedFiles(app, forkLayout, fork.typeNames, layout.root)
			.filter((f) => f.path.startsWith(prefix))
			.filter((f) => exists(app, layout.root ? `${layout.root}/${f.path.slice(prefix.length)}` : f.path.slice(prefix.length)))
			.map((f) => f.path),
	);
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
		{ id: 'fork-notes', paths: has('fork') ? forkNotes(app, sources, layout) : [] },
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

