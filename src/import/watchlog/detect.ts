import { normalizePath, parseYaml, type App, type TFile } from 'obsidian';
import { hasTopLevelKey } from '../../storage/baseFile';
import { VaultLayout, detectRoot } from '../../storage/VaultLayout';
import type { LocalData } from '../../storage/storageTypes';
import { DEFAULT_SETTINGS } from '../../types';
import type { WatchLogData } from './schema1Types';

/** Top-level key of the settings block WatchLog Sync wrote into its base. */
const WATCHLOG_KEY = 'watchlog';
/** Base file name of WatchLog Sync. */
const WATCHLOG_BASE_FILE = 'WatchLog.base';
/** Read access to the plugin folders below the config dir. */
interface PluginDataSource {
	configDir: string;
	adapter: { exists(path: string): Promise<boolean>; read(path: string): Promise<string> };
}

/** A WatchLog data.json found in the vault. */
interface WatchLogPluginData {
	raw: unknown;
	/** Plugin id it was read from. */
	id: string;
	/** Its plugin folder (side files of very old installs live there). */
	dir: string;
}

const isEmptyData = (raw: unknown): boolean =>
	raw === null || raw === undefined || (typeof raw === 'object' && Object.keys(raw).length === 0);

/**
 * First `.base` (path-sorted, the rule of `VaultLayout.findRoot`) named `WatchLog.base` or holding a
 * top-level `watchlog:` block; null when the vault has none.
 */
export async function findWatchLogBase(app: App): Promise<TFile | null> {
	const bases = app.vault.getFiles().filter((f) => f.extension === 'base');
	bases.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	for (const f of bases) {
		if (f.name === WATCHLOG_BASE_FILE) return f;
		if (hasTopLevelKey(await app.vault.cachedRead(f), WATCHLOG_KEY)) return f;
	}
	return null;
}

async function readPluginData(src: PluginDataSource, id: string): Promise<WatchLogPluginData | null> {
	const dir = normalizePath(`${src.configDir}/plugins/${id}`);
	const path = normalizePath(`${dir}/data.json`);
	try {
		if (!(await src.adapter.exists(path))) return null;
		const parsed: unknown = JSON.parse(await src.adapter.read(path));
		return isEmptyData(parsed) ? null : { raw: parsed, id, dir };
	} catch (e) {
		console.warn(`[Hoard] could not read the data.json of ${id}`, e);
		return null;
	}
}

export type WatchLogSourceKind = 'original' | 'fork';

export interface SourceCounts {
	titles: number;
	books: number;
	manga: number;
	games: number;
	lists: number;
	notes: number;
}

/** WatchLog (schema 1): everything in its plugin data.json. */
export interface OriginalSource {
	kind: 'original';
	dir: string;
	data: WatchLogData;
	counts: SourceCounts;
	pluginEnabled: boolean;
}

/** WatchLog Sync: notes below `root` plus the device-local data.json (schema 2). */
export interface ForkSource {
	kind: 'fork';
	base: TFile;
	root: string;
	typeNames: string[];
	data: LocalData | null;
	counts: SourceCounts;
	pluginEnabled: boolean;
}

export interface WatchLogSources {
	original: OriginalSource | null;
	fork: ForkSource | null;
	hoardHasData: boolean;
}

const ORIGINAL_ID = 'watchlog';
const FORK_ID = 'watchlog-sync';

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/** Obsidian's private plugin registry; typed locally. */
type AppWithPlugins = App & { plugins?: { enabledPlugins?: Set<string> } };
const isEnabled = (app: App, id: string): boolean =>
	(app as AppWithPlugins).plugins?.enabledPlugins?.has(id) ?? false;

const pluginSource = (app: App): PluginDataSource => ({ configDir: app.vault.configDir, adapter: app.vault.adapter });

function originalCounts(data: WatchLogData): SourceCounts {
	const titles = data.titles.length;
	const books = data.reading?.books?.length ?? 0;
	const manga = data.reading?.manga?.length ?? 0;
	const games = data.games?.games?.length ?? 0;
	return { titles, books, manga, games, lists: 0, notes: titles + books + manga + games };
}

async function detectOriginal(app: App): Promise<OriginalSource | null> {
	const found = await readPluginData(pluginSource(app), ORIGINAL_ID);
	if (!found || !isRecord(found.raw) || !Array.isArray(found.raw.titles)) return null;
	const data = found.raw as unknown as WatchLogData;
	return {
		kind: 'original', dir: found.dir, data, counts: originalCounts(data),
		pluginEnabled: isEnabled(app, ORIGINAL_ID),
	};
}

/** Type names from the base's `watchlog:` block; Hoard's defaults when it lists none. */
async function readTypeNames(app: App, base: TFile): Promise<string[]> {
	try {
		const block = (parseYaml(await app.vault.cachedRead(base)) as Record<string, unknown> | null)?.[WATCHLOG_KEY];
		const types = isRecord(block) && isRecord(block.settings) ? block.settings.types : undefined;
		if (Array.isArray(types)) {
			const names = types.flatMap((t: unknown) => (isRecord(t) && typeof t.name === 'string' ? [t.name] : []));
			if (names.length) return names;
		}
	} catch (e) {
		console.warn('[Hoard] could not parse the WatchLog base', e);
	}
	return DEFAULT_SETTINGS.types.map((t) => t.name);
}

async function readForkData(app: App): Promise<LocalData | null> {
	const found = await readPluginData(pluginSource(app), FORK_ID);
	return found && isRecord(found.raw) && found.raw.schemaVersion === 2 ? (found.raw as unknown as LocalData) : null;
}

function forkCounts(app: App, root: string, typeNames: string[], hoardRoot: string | null): SourceCounts {
	const layout = new VaultLayout(root, () => typeNames);
	const counts: SourceCounts = { titles: 0, books: 0, manga: 0, games: 0, lists: 0, notes: 0 };
	const hoardInside = hoardRoot !== null && hoardRoot !== root && (root === '' || hoardRoot.startsWith(`${root}/`));
	for (const f of app.vault.getMarkdownFiles()) {
		if (hoardInside && (f.path === hoardRoot || f.path.startsWith(`${hoardRoot}/`))) continue;
		if (f.parent?.path === layout.customListsFolder) { counts.lists++; counts.notes++; continue; }
		const hit = layout.classify(f.path);
		if (!hit) continue;
		counts[hit.kind === 'title' ? 'titles' : `${hit.kind}s` as 'books' | 'games']++;
		counts.notes++;
	}
	return counts;
}

async function detectFork(app: App, hoardRoot: string | null): Promise<ForkSource | null> {
	const base = await findWatchLogBase(app);
	if (!base) return null;
	const root = base.parent?.path === '/' ? '' : (base.parent?.path ?? '');
	const typeNames = await readTypeNames(app, base);
	return {
		kind: 'fork', base, root, typeNames, data: await readForkData(app),
		counts: forkCounts(app, root, typeNames, hoardRoot), pluginEnabled: isEnabled(app, FORK_ID),
	};
}

/** Finds WatchLog data sources and whether Hoard already holds data. Read-only; never throws on broken data. */
export async function detectWatchLogSources(app: App): Promise<WatchLogSources> {
	const hoardRoot = await detectRoot(app.vault);
	return {
		original: await detectOriginal(app),
		fork: await detectFork(app, hoardRoot),
		hoardHasData: hoardRoot !== null,
	};
}
