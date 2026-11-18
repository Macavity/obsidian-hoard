import { normalizePath, type Vault } from 'obsidian';
import type { EntryKind } from './storageTypes';
import { hasHoardKey } from './baseFile';
import { FOLDERS, safeFileName } from '../domain/typeName';

const BASE_FILE = 'Hoard.base';
const HISTORY_FILE = 'History.md';
/** Folder structure below the vault root; entry id = note path relative to root, without `.md`. */
export class VaultLayout {
	readonly root: string;

	constructor(root: string, private watchTypes: () => string[]) {
		this.root = normalizePath(root);
	}

	/** Root = folder of the first (path-sorted) `.base` with a `hoard:` key. */
	static findRoot(bases: { path: string; hasHoardKey: boolean }[]): string | null {
		const first = bases.filter((b) => b.hasHoardKey).map((b) => b.path).sort()[0];
		if (first === undefined) return null;
		const i = first.lastIndexOf('/');
		return i < 0 ? '' : first.slice(0, i);
	}

	/** The base file: where it is read from and where a new one is created. */
	get basePath(): string { return this.join(BASE_FILE); }
	get historyPath(): string { return this.join(HISTORY_FILE); }
	get customListsFolder(): string { return this.join(FOLDERS.customLists); }

	folderFor(kind: EntryKind, type?: string): string {
		return this.join(kind === 'title' ? (type ?? '') : FOLDERS[kind]);
	}

	notePath(kind: EntryKind, title: string, type?: string): string {
		// Titles keep their untrimmed form; other kinds trim and fall back like their managers.
		const safe = kind === 'title'
			? safeFileName(title)
			: safeFileName(title).trim() || kind;
		return normalizePath(`${this.folderFor(kind, type)}/${safe}.md`);
	}

	idFromPath(path: string): string {
		const p = normalizePath(path);
		const rel = this.root && p.startsWith(this.root + '/') ? p.slice(this.root.length + 1) : p;
		return rel.replace(/\.md$/, '');
	}

	pathFromId(id: string): string {
		return this.join(`${id}.md`);
	}

	classify(path: string): { kind: EntryKind; id: string; type?: string } | null {
		const p = normalizePath(path);
		if (this.root && !p.startsWith(this.root + '/')) return null;
		const parts = (this.root ? p.slice(this.root.length + 1) : p).split('/');
		const [folder, file, ...deeper] = parts;
		if (folder === undefined || file === undefined || deeper.length > 0) return null;
		if (!file.endsWith('.md')) return null;
		const id = `${folder}/${file.slice(0, -3)}`;
		if (folder === FOLDERS.customLists) return null;
		if (folder === FOLDERS.book) return { kind: 'book', id };
		if (folder === FOLDERS.manga) return { kind: 'manga', id };
		if (folder === FOLDERS.game) return { kind: 'game', id };
		if (this.watchTypes().includes(folder)) return { kind: 'title', id, type: folder };
		return null;
	}

	private join(rel: string): string {
		return normalizePath(this.root ? `${this.root}/${rel}` : rel);
	}
}

/** Root of the vault's Hoard data (see `VaultLayout.findRoot`); null when no base has a `hoard:` key. */
export async function detectRoot(vault: Pick<Vault, 'getFiles' | 'cachedRead'>): Promise<string | null> {
	const bases = await Promise.all(
		vault.getFiles()
			.filter((f) => f.extension === 'base')
			.map(async (f) => ({ path: f.path, hasHoardKey: hasHoardKey(await vault.cachedRead(f)) })),
	);
	return VaultLayout.findRoot(bases);
}
