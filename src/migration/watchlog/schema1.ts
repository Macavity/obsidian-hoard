import { TFile, normalizePath } from 'obsidian';
import type { EntryAirtime, GamesData, ReadingData } from '../../types';
import type { HistoryEntry } from '../../HistoryManager';
import { SHARED_SETTING_KEYS } from '../../storage/SharedConfigStore';
import type { EntryCache } from '../../storage/storageTypes';
import { encodeTitle, splitCache } from '../../storage/titleCodec';
import { encodeBook, encodeManga } from '../../storage/readingCodec';
import { encodeGame } from '../../storage/gameCodec';
import { externalIdFromLink } from '../../storage/externalId';
import { hasHoardKey } from '../../storage/baseFile';
import { FolderMover, ensureFolder } from './schema1Folders';
import { NoteWriter, sameValue } from './schema1Notes';
import { buildLocalData, collectAirtime, collectGroups, importHistory } from './schema1Records';
import {
	normalizeGames, normalizeReading, normalizeTitle, progressOf, watchLogApiValues,
} from './schema1Normalize';
import {
	REMOVED_SETTINGS, emptyReport, isRecord,
	type Fm, type IdMaps, type ImportContext, type Schema1Context, type Schema1Report, type WatchLogData, type WatchLogTitle,
} from './schema1Types';

/** Copy of WatchLog's schema-1 data.json, written once next to it before anything changes. */
export const SCHEMA1_BACKUP_FILE = 'data.v1-backup.json';
/** Adds groups and the recurring schedule (none on a second device) to an entry. */
type Extras = <T extends { groups?: string[]; airtime?: EntryAirtime }>(item: T, key: string) => T;

/** WatchLog's root folder when its settings name none. */
const DEFAULT_ROOT = 'WatchLog';
/** A second device must not re-add what the first one migrated (and the user may have changed since). */
const JOINED_KEYS = ['watched', 'skipped', 'seasons'];

/** Root folder of a schema-1 install: its `rootFolder` setting. */
export function watchLogRoot(data: WatchLogData): string {
	const root = (data.settings as Record<string, unknown> | undefined)?.rootFolder;
	return normalizePath(typeof root === 'string' && root.trim() ? root : DEFAULT_ROOT);
}

/**
 * Converts a schema-1 data.json into notes, the base, History.md and a schema-2 data.json. Every
 * step checks the current state, so a rerun (or a second device with the same data) changes
 * nothing. Existing note values are never overwritten. On an error data.json stays schema 1.
 */
export async function migrateSchema1(ctx: Schema1Context): Promise<Schema1Report> {
	const report = emptyReport();
	try {
		await new Schema1Migration(ctx, ctx.data, report, ctx.pluginDir).run();
	} catch (e) {
		report.errors.push(e instanceof Error ? e.message : String(e));
	}
	return report;
}

/**
 * Imports WatchLog data (a restored v1-v3 backup) into the vault: notes are created or only
 * filled, groups, airtime and history are applied, the base is filled when empty and the cache is
 * merged. Writes no backup, moves no folders, leaves schemaVersion alone and only fills missing
 * device-local settings.
 */
export async function importWatchLogData(data: WatchLogData, ctx: ImportContext): Promise<Schema1Report> {
	const report = emptyReport();
	try {
		await new Schema1Migration(ctx, data, report, undefined).importOnly();
	} catch (e) {
		report.errors.push(e instanceof Error ? e.message : String(e));
	}
	return report;
}

class Schema1Migration {
	private cache: Record<string, EntryCache> = {};
	private claimed = new Set<string>();
	/** A base with `hoard:` existed before this run: another device migrated already. */
	private joined = false;
	private ids: IdMaps = { title: new Map(), book: new Map(), manga: new Map(), game: new Map(), group: new Map() };
	private notes: NoteWriter;

	constructor(
		private ctx: ImportContext,
		private source: WatchLogData,
		private report: Schema1Report,
		private pluginDir: string | undefined,
	) {
		this.notes = new NoteWriter(ctx.app, ctx.yaml, report);
	}

	async run(): Promise<void> {
		await this.backup();
		this.joined = await this.baseExists();
		const data = await this.prepare(true);
		await new FolderMover(this.ctx.app, this.ctx.layout, this.report).centralize(data);
		await this.importData(data);
		await this.ctx.local.adoptV2(buildLocalData(data, this.ids, this.cache));
	}

	/** Restore path: the notes, base, history and cache part of `run`, nothing else. */
	async importOnly(): Promise<void> {
		const data = await this.prepare(false);
		await this.importData(data);
		const { local } = this.ctx;
		for (const [id, cache] of Object.entries(this.cache)) {
			local.data.cache[id] = { ...cache, ...local.data.cache[id] };
		}
		// device-local settings (API keys): fill what is missing, never overwrite, never into vault files
		for (const [k, v] of Object.entries(data.settings)) {
			if (SHARED_SETTING_KEYS.includes(k) || REMOVED_SETTINGS.includes(k)) continue;
			const cur = local.data.settings[k];
			if (cur === undefined || cur === null || cur === '') local.data.settings[k] = v;
		}
		local.queueSave();
	}

	private async importData(data: WatchLogData): Promise<void> {
		await this.importEntries(data);
		await importHistory(this.ctx.history, data, this.ids);
		// last: an interrupted run must not look like a finished migration on the retry
		await this.ensureBase(data);
	}

	private async baseExists(): Promise<boolean> {
		const base = this.ctx.shared.baseFile();
		return base !== null && hasHoardKey(await this.ctx.app.vault.read(base));
	}

	private dir(): string {
		const dir = this.pluginDir;
		if (!dir) throw new Error('plugin folder unknown, no backup of data.json written');
		return dir;
	}

	/** Copies data.json to the backup file once. */
	private async backup(): Promise<void> {
		const adapter = this.ctx.app.vault.adapter;
		const dir = this.dir();
		const target = normalizePath(`${dir}/${SCHEMA1_BACKUP_FILE}`);
		if (await adapter.exists(target)) return;
		const source = normalizePath(`${dir}/data.json`);
		const content = (await adapter.exists(source))
			? await adapter.read(source)
			: JSON.stringify(this.source, null, '\t');
		await adapter.write(target, content);
	}

	/** A normalized copy of the data with WatchLog's load-time corrections applied. */
	private async prepare(mergeFiles: boolean): Promise<WatchLogData> {
		const data = structuredClone(this.source);
		data.settings = isRecord(data.settings) ? data.settings : {};
		if (mergeFiles) await this.mergeSideFiles(data);
		data.titles = (Array.isArray(data.titles) ? data.titles : []).map(normalizeTitle);
		data.groups = Array.isArray(data.groups) ? data.groups : [];
		data.reading = normalizeReading(data.reading);
		data.games = normalizeGames(data.games);
		return data;
	}

	/** Very old installs kept reading.json / history.json beside data.json. */
	private async mergeSideFiles(data: WatchLogData): Promise<void> {
		if (data.migratedReadingHistory === true) return;
		const adapter = this.ctx.app.vault.adapter;
		const readJson = async (name: string): Promise<unknown> => {
			const path = normalizePath(`${this.dir()}/${name}`);
			return (await adapter.exists(path)) ? JSON.parse(await adapter.read(path)) as unknown : null;
		};
		const reading = await readJson('reading.json');
		const hasReading = (data.reading?.books?.length ?? 0) > 0 || (data.reading?.manga?.length ?? 0) > 0;
		if (isRecord(reading) && !hasReading) data.reading = reading as unknown as ReadingData;
		const history = await readJson('history.json');
		if (isRecord(history) && Array.isArray(history.entries) && !data.history?.length) {
			data.history = history.entries as HistoryEntry[];
		}
	}

	/** Creates the base, or fills an empty `hoard:` block; the store whitelists out every secret. */
	private async ensureBase(data: WatchLogData): Promise<void> {
		const { shared, layout } = this.ctx;
		const reading = data.reading as ReadingData;
		const initial: Record<string, unknown> = {
			...data.settings,
			reading: { ...reading.settings, bookColumns: reading.bookColumns, mangaColumns: reading.mangaColumns },
			games: (data.games as GamesData).settings,
		};
		await shared.load();
		if (!shared.baseFile()) {
			await ensureFolder(this.ctx.app, layout.root);
			await shared.createBase(initial);
		} else if (Object.keys(shared.get().settings).length === 0) {
			await shared.update(initial);
		}
	}

	/** A free note path for this run: duplicates (same title and type) get " 2", " 3", … */
	private claim(path: string): string {
		let p = path;
		for (let n = 2; this.claimed.has(p); n++) p = `${path.slice(0, -3)} ${n}.md`;
		this.claimed.add(p);
		return p;
	}

	private async importEntries(data: WatchLogData): Promise<void> {
		const groups = collectGroups(data, this.ids);
		const airtime = collectAirtime(data);
		const extras: Extras = (item, key) => {
			if (this.joined) return item;
			const g = groups.get(key);
			if (g) item.groups = g;
			const a = airtime.get(key);
			if (a) item.airtime = a;
			return item;
		};
		await this.importTitles(data, extras);
		await this.importMaybe(data);
		await this.importReadingAndGames(data, extras);
	}

	private async importTitles(data: WatchLogData, extras: Extras): Promise<void> {
		const layout = this.ctx.layout;
		for (const t of data.titles) {
			const path = this.claim(layout.notePath('title', t.title, t.type));
			const title = extras({ ...t, id: layout.idFromPath(path) }, `title:${t.id}`);
			this.ids.title.set(t.id, title.id);
			await this.writeTitle(path, title);
		}
	}

	/** Maybe titles become titles with `maybe: true`; one already in the library is skipped. */
	private async importMaybe(data: WatchLogData): Promise<void> {
		const layout = this.ctx.layout;
		for (const m of data.maybe ?? []) {
			const path = layout.notePath('title', m.title, m.type);
			if (this.claimed.has(path)) {
				this.report.skipped.push(`maybe "${m.title}": already in the library`);
				continue;
			}
			this.claim(path);
			if (this.joined && this.ctx.app.vault.getAbstractFileByPath(path)) {
				this.report.skipped.push(`maybe "${m.title}": ${path} already exists`);
				continue;
			}
			const title = normalizeTitle({
				title: m.title, type: m.type, status: 'Plan to watch', priority: '', dateAdded: m.dateAdded,
				dateModified: m.dateAdded, totalEpisodes: m.totalEpisodes, episodeDuration: m.episodeDuration,
				releaseDate: m.releaseDate, externalLink: m.externalLink, maybe: true,
			});
			title.id = layout.idFromPath(path);
			this.ids.title.set(m.id, title.id);
			await this.writeTitle(path, title);
		}
	}

	private async importReadingAndGames(data: WatchLogData, extras: Extras): Promise<void> {
		const layout = this.ctx.layout;
		const reading = data.reading as ReadingData;
		const place = (kind: 'book' | 'manga' | 'game', title: string, oldId: string): { path: string; id: string } => {
			const path = this.claim(layout.notePath(kind, title));
			const id = layout.idFromPath(path);
			this.ids[kind].set(oldId, id);
			return { path, id };
		};
		for (const b of reading.books) {
			const { path, id } = place('book', b.title, b.id);
			const book = extras({ ...b, id, vaultPage: `${id}.md` }, `book:${b.id}`);
			await this.writeEntry(path, encodeBook(book), '## Notes\n\n\n## Quotes\n');
		}
		for (const m of reading.manga) {
			const { path, id } = place('manga', m.title, m.id);
			const manga = extras({ ...m, id, vaultPage: `${id}.md` }, `manga:${m.id}`);
			await this.writeEntry(path, encodeManga(manga), '## Notes\n\n\n## Quotes\n');
		}
		for (const g of (data.games as GamesData).games) {
			const { path, id } = place('game', g.title, g.id);
			const game = extras({ ...g, id, vaultPage: `${id}.md` }, `game:${g.id}`);
			await this.writeEntry(path, encodeGame(game), '## Notes\n');
		}
	}

	/** Book, manga or game; the cover stays a note field (E12). On a second device nothing is created or filled. */
	private async writeEntry(path: string, fm: Fm, body: string): Promise<void> {
		if (!this.joined) await this.notes.write(path, fm, body);
	}

	private async writeTitle(path: string, title: WatchLogTitle): Promise<void> {
		// without an API identity nothing can refetch the seasons: they belong in the note
		const fetchable = !!title.tmdbId || !!title.malId || !!title.anilistId || externalIdFromLink(title.externalLink) !== null;
		if (!fetchable && title.seasons.length > 0) title.seasonsOverride = true;
		// the poster is a note field (E12): WatchLog's manual one wins over the fetched one
		const { manualPosterUrl, ...entry } = title;
		if (manualPosterUrl?.trim()) entry.posterUrl = manualPosterUrl;
		const fm = encodeTitle(entry, progressOf(entry));
		// a note value the user set (manual trailer, overrides) is never stale, even where it equals the API's
		const apiValues = watchLogApiValues(entry);
		for (const k of Object.keys(apiValues)) if (k in fm && sameValue(fm[k], apiValues[k])) delete apiValues[k];
		if (this.joined && !title.maybe) {
			// another device migrated: only progress for notes that exist, the cache for those
			if (!(this.ctx.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
				this.report.skipped.push(`${path}: no note, not recreated`);
				return;
			}
			for (const k of Object.keys(fm)) if (!JOINED_KEYS.includes(k)) delete fm[k];
		}
		const cache = splitCache(entry);
		if (Object.keys(cache).length > 0) this.cache[entry.id] = cache;
		await this.notes.write(path, fm, `## Notes\n\n${entry.notes}\n`, apiValues);
	}
}
