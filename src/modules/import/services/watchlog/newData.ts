import type { Vault } from 'obsidian';
import { VaultLayout } from '../../../../shared/storage/VaultLayout';
import type { EntryKind } from '../../../../shared/storage/storageTypes';
import type { ForkSource, OriginalSource, WatchLogSourceKind, WatchLogSources } from './detect';
import { isListNote, originalFolders } from './originalPaths';
import { forkTarget, managedFiles, nestedHoardRoot } from './paths';

type Paths = (vault: Vault, layout: VaultLayout) => Promise<string[]>;

/** Hoard paths the original import writes: a note per entry (Maybe titles included) and each custom list. */
const originalTargets = (src: OriginalSource): Paths => async (vault, layout) => {
	const { data } = src;
	const paths = [...data.titles, ...(data.maybe ?? [])].map((t) => layout.notePath('title', t.title, t.type));
	const others: [EntryKind, { title: string }[] | undefined][] = [
		['book', data.reading?.books], ['manga', data.reading?.manga], ['game', data.games?.games],
	];
	for (const [kind, items] of others) for (const { title } of items ?? []) paths.push(layout.notePath(kind, title));
	const lists = originalFolders(data).lists;
	for (const f of vault.getMarkdownFiles()) {
		if (f.parent?.path === lists && isListNote(await vault.cachedRead(f))) paths.push(`${layout.customListsFolder}/${f.name}`);
	}
	return paths;
};

/** Hoard paths the fork import copies its managed files to. */
const forkTargets = (src: ForkSource): Paths => (vault, layout) => {
	const forkLayout = new VaultLayout(src.root, () => src.typeNames);
	const files = managedFiles(vault, forkLayout, src.typeNames, nestedHoardRoot(src.root, layout.root));
	return Promise.resolve(files.map((f) => forkTarget(f.path, src.root, layout.root)));
};

/**
 * Of `kinds`, those whose import would still create a note in Hoard. A source imported on another
 * device (the notes synced, the decision is device-local) has nothing left. Device settings and the
 * cache are not counted, nor keys missing from existing notes. Read-only.
 */
export async function kindsWithNewData(
	vault: Vault, sources: WatchLogSources, layout: VaultLayout, kinds: WatchLogSourceKind[],
): Promise<WatchLogSourceKind[]> {
	const targets: Record<WatchLogSourceKind, Paths | null> = {
		original: sources.original ? originalTargets(sources.original) : null,
		fork: sources.fork ? forkTargets(sources.fork) : null,
	};
	const result: WatchLogSourceKind[] = [];
	for (const kind of kinds) {
		const paths = await targets[kind]?.(vault, layout);
		if (paths?.some((p) => !vault.getAbstractFileByPath(p))) result.push(kind);
	}
	return result;
}
