import { normalizePath, type DataAdapter } from 'obsidian';
import type { EntryAirtime, GamesData, ReadingData } from '../../types';
import type { HistoryEntry } from '../../HistoryManager';
import { SHARED_SETTING_KEYS } from '../../storage/SharedConfigStore';
import type { EntryCache, EntryKind } from '../../storage/storageTypes';
import { encodeTitle, splitCache } from '../../storage/titleCodec';
import { encodeBook, encodeManga } from '../../storage/readingCodec';
import { encodeGame } from '../../storage/gameCodec';
import { externalIdFromLink } from '../../storage/externalId';
import { NoteWriter, ensureFolder, sameValue } from './schema1Notes';
import { collectAirtime, collectGroups, importHistory } from './schema1Records';
import {
	normalizeGames, normalizeReading, normalizeTitle, progressOf, watchLogApiValues,
} from './schema1Normalize';
import {
	REMOVED_SETTINGS, WISHLIST, isRecord,
	type Fm, type IdMaps, type ImportContext, type ImportHooks, type WatchLogData, type WatchLogTitle,
} from './schema1Types';
import { emptyImportReport, type ImportReport } from './report';

/** Adds groups and the recurring schedule to an entry. */
type Extras = <T extends { groups?: string[]; airtime?: EntryAirtime }>(item: T, key: string) => T;

/**
 * Imports WatchLog data (a restored v1-v3 backup) into the vault: notes are created or only
 * filled, groups, airtime and history are applied, the base is filled when empty and the cache is
 * merged. Moves no folders, leaves schemaVersion alone and only fills missing device-local
 * settings.
 */
export async function importWatchLogData(
	data: WatchLogData, ctx: ImportContext, hooks: ImportHooks = {},
): Promise<ImportReport> {
	const report = emptyImportReport();
	try {
		await new Schema1Migration(ctx, data, report, hooks).importData();
	} catch (e) {
		report.errors.push(e instanceof Error ? e.message : String(e));
	}
	return report;
}

/** Very old installs kept reading.json / history.json beside data.json; fills what `data` lacks from them. */
export async function mergeSideFiles(adapter: DataAdapter, dir: string, data: WatchLogData): Promise<void> {
	if (data.migratedReadingHistory === true) return;
	const readJson = async (name: string): Promise<unknown> => {
		const path = normalizePath(`${dir}/${name}`);
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

class Schema1Migration {
	private cache: Record<string, EntryCache> = {};
	private claimed = new Set<string>();
	private ids: IdMaps = { title: new Map(), book: new Map(), manga: new Map(), game: new Map(), group: new Map() };
	private notes: NoteWriter;
	private done = 0;
	private total = 0;

	constructor(
		private ctx: ImportContext,
		private source: WatchLogData,
		private report: ImportReport,
		private hooks: ImportHooks,
	) {
		this.notes = new NoteWriter(ctx.app, ctx.yaml, report);
	}

	/** The notes, base, history and cache part of an import, plus missing device-local settings. */
	async importData(): Promise<void> {
		const data = this.prepare();
		await this.importEntries(data);
		this.hooks.progress?.('history', 1, 1);
		await importHistory(this.ctx.history, data, this.ids);
		// last: an interrupted run must not look like a finished import on the retry
		await this.ensureBase(data);
		this.hooks.progress?.('base', 1, 1);
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
		this.hooks.progress?.('settings', 1, 1);
	}

	/** A normalized copy of the data with WatchLog's load-time corrections applied. */
	private prepare(): WatchLogData {
		const data = structuredClone(this.source);
		data.settings = isRecord(data.settings) ? data.settings : {};
		// 'Wishlist' is a flag now; a stored exclude would linger as a filter without a checkbox
		const filters = (data.settings as Record<string, unknown>).gamesFilters;
		if (isRecord(filters) && Array.isArray(filters.statusExclude)) {
			filters.statusExclude = (filters.statusExclude as unknown[]).filter((n) => n !== WISHLIST);
		}
		data.titles = (Array.isArray(data.titles) ? data.titles : []).map(normalizeTitle);
		data.groups = Array.isArray(data.groups) ? data.groups : [];
		data.reading = normalizeReading(data.reading);
		data.games = normalizeGames(data.games);
		return data;
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

	/**
	 * A free note path for this run: duplicates (same title and type) get " 2", " 3", … Compared
	 * case-insensitively, since macOS and Windows treat "Heat" and "heat" as one file.
	 */
	private claim(path: string): string {
		let p = path;
		for (let n = 2; this.claimed.has(p.toLowerCase()); n++) p = `${path.slice(0, -3)} ${n}.md`;
		this.claimed.add(p.toLowerCase());
		return p;
	}

	private async importEntries(data: WatchLogData): Promise<void> {
		const reading = data.reading as ReadingData;
		this.total = data.titles.length + (data.maybe?.length ?? 0) + reading.books.length + reading.manga.length
			+ (data.games as GamesData).games.length;
		const groups = collectGroups(data, this.ids);
		const airtime = collectAirtime(data);
		const extras: Extras = (item, key) => {
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
			await this.entry(`title:${t.id}`, async () => {
				const path = this.claim(layout.notePath('title', t.title, t.type));
				const title = extras({ ...t, id: layout.idFromPath(path) }, `title:${t.id}`);
				this.ids.title.set(t.id, title.id);
				await this.writeTitle(path, title);
			});
		}
	}

	/** Maybe titles become titles with `maybe: true`; one already in the library is skipped. */
	private async importMaybe(data: WatchLogData): Promise<void> {
		const layout = this.ctx.layout;
		for (const m of data.maybe ?? []) {
			const path = layout.notePath('title', m.title, m.type);
			if (this.claimed.has(path.toLowerCase())) {
				this.report.review.push({ path, reason: 'exists', code: 'maybe', params: { title: m.title } });
				this.advance();
				continue;
			}
			this.claim(path);
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
			await this.entry(`book:${b.id}`, async () => {
				const { path, id } = place('book', b.title, b.id);
				const book = extras({ ...b, id, vaultPage: `${id}.md` }, `book:${b.id}`);
				await this.put('book', path, b.title, encodeBook(book, reading.bookColumns), '## Notes\n\n\n## Quotes\n');
			});
		}
		for (const m of reading.manga) {
			await this.entry(`manga:${m.id}`, async () => {
				const { path, id } = place('manga', m.title, m.id);
				const manga = extras({ ...m, id, vaultPage: `${id}.md` }, `manga:${m.id}`);
				await this.put('manga', path, m.title, encodeManga(manga, reading.mangaColumns), '## Notes\n\n\n## Quotes\n');
			});
		}
		for (const g of (data.games as GamesData).games) {
			await this.entry(`game:${g.id}`, async () => {
				const { path, id } = place('game', g.title, g.id);
				const game = extras({ ...g, id, vaultPage: `${id}.md` }, `game:${g.id}`);
				await this.put('game', path, g.title, encodeGame(game), '## Notes\n');
			});
		}
	}

	/**
	 * Runs one entry; data too broken to even name its note (no title, say) is reported under `label`
	 * and skipped, so it never blocks the entries after it.
	 */
	private async entry(label: string, fn: () => Promise<void>): Promise<void> {
		try {
			await fn();
		} catch (e) {
			this.fail(label, e);
			this.advance();
		}
	}

	private fail(path: string, e: unknown): void {
		const message = e instanceof Error ? e.message : String(e);
		this.report.review.push({ path, reason: 'error', code: 'failed', params: { message } });
		this.report.errors.push(`${path}: ${message}`);
	}

	/**
	 * Writes one entry's note; a body the source kept for it replaces the default one of a new note.
	 * A failing note is reported and skipped, so one bad entry never blocks the rest of the import.
	 */
	private async put(
		kind: EntryKind, path: string, title: string, fm: Fm, body: string, apiValues?: Fm, type?: string,
	): Promise<void> {
		try {
			const old = this.ctx.app.vault.getAbstractFileByPath(path) ? null : await this.hooks.oldBody?.(kind, title, type);
			await this.notes.write(path, fm, old ?? body, apiValues);
		} catch (e) {
			this.fail(path, e);
			// history must not link to a note that does not exist
			const id = this.ctx.layout.idFromPath(path);
			for (const map of Object.values(this.ids) as Map<string, string>[]) for (const [k, v] of map) if (v === id) map.delete(k);
		}
		this.advance();
	}

	private advance(): void {
		this.hooks.progress?.('notes', ++this.done, this.total);
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
		const cache = splitCache(entry);
		if (Object.keys(cache).length > 0) this.cache[entry.id] = cache;
		await this.put('title', path, entry.title, fm, `## Notes\n\n${entry.notes}\n`, apiValues, entry.type);
	}
}
