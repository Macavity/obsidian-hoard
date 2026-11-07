import { TFile, TFolder, normalizePath, type App } from 'obsidian';
import type { GamesData, ReadingData } from '../../types';
import type { VaultLayout } from '../../storage/VaultLayout';
import type { Schema1Report, WatchLogData } from './schema1Types';

/** WatchLog's default folders, used where its settings name none. */
const DEFAULT_READING_FOLDER = 'WatchLog/Reading';
const DEFAULT_GAMES_FOLDER = 'WatchLog/Games';
const DEFAULT_LISTS_FOLDER = 'WatchLog/CustomLists';
const CUSTOM_LIST_DATA = /^## Data\r?\n```json/m;
const UNSAFE = /[*"\\/<>:|?]/g;

/** Creates a folder unless it exists (or another writer created it meanwhile). */
export async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path || app.vault.getAbstractFileByPath(path)) return;
	try {
		await app.vault.createFolder(path);
	} catch {
		// created concurrently
	}
}

/** Moves WatchLog's reading, games and custom-list notes into Hoard's central folders below the root. */
export class FolderMover {
	constructor(private app: App, private layout: VaultLayout, private report: Schema1Report) {}

	async centralize(data: WatchLogData): Promise<void> {
		const layout = this.layout;
		const reading = data.reading as ReadingData;
		const games = data.games as GamesData;
		const readingRoot = normalizePath(reading.settings.defaultFolder || DEFAULT_READING_FOLDER);
		const gamesFolder = normalizePath(games.settings.defaultFolder || DEFAULT_GAMES_FOLDER);
		const lists = (data.settings as Record<string, unknown>).customListsFolder;
		const listsFolder = normalizePath(typeof lists === 'string' && lists ? lists : DEFAULT_LISTS_FOLDER);

		const notePaths = (folder: string, titles: string[], fallback: string): Set<string> =>
			new Set(titles.map((t) => normalizePath(`${folder}/${t.replace(UNSAFE, '-').trim() || fallback}.md`)));
		const books = normalizePath(`${readingRoot}/Books`);
		const manga = normalizePath(`${readingRoot}/Manga`);
		await this.moveFolder(books, layout.folderFor('book'), notePaths(books, reading.books.map((b) => b.title), 'book'));
		await this.moveFolder(manga, layout.folderFor('manga'), notePaths(manga, reading.manga.map((m) => m.title), 'manga'));
		await this.moveFolder(gamesFolder, layout.folderFor('game'), notePaths(gamesFolder, games.games.map((g) => g.title), 'game'));
		await this.moveFolder(listsFolder, layout.customListsFolder, 'lists');
		await this.pruneEmpty(readingRoot);
	}

	private holdsRoot(folder: string): boolean {
		const root = this.layout.root;
		return folder === '' || root === folder || root.startsWith(`${folder}/`);
	}

	/**
	 * Moves the files of `from` into `to`; a file whose name exists there stays and is reported. Only
	 * WatchLog's notes move (for the custom lists: files with a `## Data` JSON block), foreign files stay.
	 */
	private async moveFolder(from: string, to: string, ownNotes: Set<string> | 'lists'): Promise<void> {
		if (from === to) return;
		const { vault, fileManager } = this.app;
		const src = vault.getAbstractFileByPath(from);
		if (!(src instanceof TFolder)) return;
		const files: TFile[] = [];
		for (const c of src.children) {
			if (!(c instanceof TFile)) continue;
			const own = ownNotes === 'lists'
				? c.extension === 'md' && CUSTOM_LIST_DATA.test(await vault.read(c))
				: ownNotes.has(c.path);
			if (own) files.push(c);
		}
		let moved = false;
		for (const file of files) {
			const target = normalizePath(`${to}/${file.name}`);
			if (vault.getAbstractFileByPath(target)) {
				this.report.skipped.push(`${file.path}: ${target} already exists`);
				continue;
			}
			await ensureFolder(this.app, to);
			await fileManager.renameFile(file, target);
			moved = true;
		}
		if (moved) this.report.foldersMoved.push(`${from} → ${to}`);
		await this.pruneEmpty(from);
	}

	private async pruneEmpty(path: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(path);
		if (!(folder instanceof TFolder) || folder.children.length > 0 || this.holdsRoot(path)) return;
		await this.app.fileManager.trashFile(folder);
	}
}
