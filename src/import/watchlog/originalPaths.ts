import { normalizePath } from 'obsidian';
import type { EntryKind } from '../../storage/storageTypes';
import { isRecord, type WatchLogData } from './schema1Types';

/** WatchLog's defaults where its settings name no folder. */
const DEFAULT_ROOT = 'WatchLog';
const DEFAULT_READING_FOLDER = 'WatchLog/Reading';
const DEFAULT_GAMES_FOLDER = 'WatchLog/Games';
const DEFAULT_LISTS_FOLDER = 'WatchLog/CustomLists';
const UNSAFE = /[*"\\/<>:|?]/g;

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v : '');
const setting = (owner: unknown, key: string): string =>
	isRecord(owner) && isRecord(owner['settings']) ? str(owner['settings'][key]) : '';

/** Where the original WatchLog plugin kept its notes, read from its data.json settings. */
export interface OriginalFolders {
	root: string;
	book: string;
	manga: string;
	game: string;
	lists: string;
}

export function originalFolders(data: WatchLogData): OriginalFolders {
	const reading = normalizePath(setting(data.reading, 'defaultFolder') || DEFAULT_READING_FOLDER);
	return {
		root: normalizePath(setting(data, 'rootFolder') || DEFAULT_ROOT),
		book: normalizePath(`${reading}/Books`),
		manga: normalizePath(`${reading}/Manga`),
		game: normalizePath(setting(data.games, 'defaultFolder') || DEFAULT_GAMES_FOLDER),
		lists: normalizePath(setting(data, 'customListsFolder') || DEFAULT_LISTS_FOLDER),
	};
}

/** Path of WatchLog's note for an entry; titles live in `<root>/<type>/`. */
export function originalNotePath(folders: OriginalFolders, kind: EntryKind, title: string, type?: string): string {
	const folder = kind === 'title' ? `${folders.root}/${type ?? ''}` : folders[kind];
	const name = title.replace(UNSAFE, '-').trim() || kind;
	return normalizePath(`${folder}/${name}.md`);
}
