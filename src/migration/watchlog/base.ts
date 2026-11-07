import { normalizePath, type App, type TFile } from 'obsidian';
import { renameTopLevelBlock } from '../../storage/baseFile';
import { WATCHLOG_KEY } from './detect';

const HOARD_BASE_FILE = 'Hoard.base';

export type BaseMigration =
	| { status: 'migrated'; from: string; to: string; rewritten: boolean }
	/** A `Hoard.base` already sits beside it: the WatchLog base is left as it is. */
	| { status: 'blocked'; path: string; existing: string };

const rewrite = (src: string): string => renameTopLevelBlock(src, WATCHLOG_KEY, 'hoard');

/**
 * Rewrites the `watchlog:` blocks of `file` (the first becomes `hoard:` unless one exists; the rest
 * stays byte-identical) and renames the file to `Hoard.base` in its folder, so links follow.
 */
export async function migrateWatchLogBase(app: App, file: TFile): Promise<BaseMigration> {
	const from = file.path;
	const slash = from.lastIndexOf('/');
	const to = normalizePath(slash < 0 ? HOARD_BASE_FILE : `${from.slice(0, slash)}/${HOARD_BASE_FILE}`);
	if (from !== to && app.vault.getAbstractFileByPath(to)) return { status: 'blocked', path: from, existing: to };
	const src = await app.vault.read(file);
	const rewritten = rewrite(src) !== src;
	if (rewritten) await app.vault.process(file, rewrite);
	if (from !== to) await app.fileManager.renameFile(file, to);
	return { status: 'migrated', from, to, rewritten };
}

