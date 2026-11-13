import { TFile, getFrontMatterInfo, parseYaml, stringifyYaml } from 'obsidian';
import type { App } from 'obsidian';
import type HoardPlugin from './main';
import type { HistoryManager } from './HistoryManager';
import type { DataStores } from './DataManager';
import type { Notify } from './storage/storageTypes';
import type { EntryIndex } from './storage/EntryIndex';
import type { LocalStore } from './storage/LocalStore';
import { ensureFolder, freeNotePath, noteFile, parentOf, trashNote, updateFrontMatter, writeEntry } from './storage/noteWrite';
import type { EntryWriteHooks } from './storage/noteWrite';
import { ChangeListeners } from './changeListeners';
import { getBaseline, sameStoredState, setBaseline } from './storage/baseline';
import { splitNested, type SharedConfigStore } from './storage/SharedConfigStore';
import type { VaultLayout } from './storage/VaultLayout';
import { FOLDERS } from './storage/VaultLayout';
import { AIRTIME_PROPS, COMMON_PROPS, READING_PROPS, CUSTOM_FIELD_PREFIX, columnNameTaken, customFieldKey } from './storage/properties';
import { decodeBook, decodeManga, encodeBook, encodeManga } from './storage/readingCodec';
import type { Fm } from './storage/storageTypes';
import {
	Book,
	Manga,
	ReadingCustomColumn,
	ReadingData,
	ReadingSettings,
	DEFAULT_READING_SETTINGS,
	isReleaseDateFuture,
	todayIso,
	READING_STATUSES,
	DEFAULT_READING_STATUS_COLORS,
} from './types';
import { slugify } from './storage/sharedHelpers';

export type ReadingKind = 'book' | 'manga';

export type ReadingItem = Book | Manga;

/** Keys both kinds can emit; the full rewrite deletes the ones the encoder omits. */
const COMMON_KEYS: readonly string[] = [
	...Object.values(COMMON_PROPS),
	...Object.values(AIRTIME_PROPS),
	READING_PROPS.author,
];
const KIND_KEYS: Record<ReadingKind, readonly string[]> = {
	book: [
		...COMMON_KEYS,
		READING_PROPS.pagesRead, READING_PROPS.totalPages, READING_PROPS.progressUnit, READING_PROPS.wordsRead,
		READING_PROPS.totalWords, READING_PROPS.chaptersRead, READING_PROPS.totalChapters, READING_PROPS.googleBooksId,
	],
	manga: [
		...COMMON_KEYS,
		READING_PROPS.chaptersRead, READING_PROPS.totalChapters, READING_PROPS.volumesRead, READING_PROPS.totalVolumes,
		READING_PROPS.malId,
	],
};

const encodeWith = (kind: ReadingKind, item: ReadingItem, columns: readonly ReadingCustomColumn[]): Fm =>
	kind === 'book' ? encodeBook(item as Book, columns) : encodeManga(item as Manga, columns);

/**
 * Books and manga, backed by one note each. Reads come from the EntryIndex (frontmatter); writes go
 * to the note via processFrontMatter and only touch keys whose encoded value changed. Reading
 * settings and table columns live in the shared config (Hoard.base).
 */
/** Notes a column rename moved, and notes it left alone (their values stay under the old key). */
export interface ColumnMoveResult {
	moved: number;
	skipped: number;
}

export class ReadingDataManager {
	private plugin: HoardPlugin;
	private app: App;
	private index: EntryIndex;
	private local: LocalStore;
	private shared: SharedConfigStore;
	private layout: () => VaultLayout;
	private notify: Notify;
	private listeners = new ChangeListeners();
	private historyManager: HistoryManager | null = null;

	private settings: ReadingSettings = { ...DEFAULT_READING_SETTINGS };
	private bookColumns: ReadingCustomColumn[] = [];
	private mangaColumns: ReadingCustomColumn[] = [];

	// Mutable copies handed to the UI, one per id. `src` is the index entry the copy was made from:
	// the baseline a write diffs against, so only fields the user changed reach the note.
	private views: Map<string, { src: ReadingItem; view: ReadingItem }> = new Map();
	// ids changed via the *Silent updaters, written on the next saveAndNotify()
	private dirty: Set<string> = new Set();

	constructor(plugin: HoardPlugin, stores: DataStores) {
		this.plugin = plugin;
		this.app = plugin.app;
		this.index = stores.index;
		this.local = stores.local;
		this.shared = stores.shared;
		this.layout = stores.layout;
		this.notify = stores.notify;
	}

	setHistoryManager(hm: HistoryManager): void {
		this.historyManager = hm;
	}

	/** After index.build() and shared.load(): follows index and shared-config changes. */
	async init(): Promise<void> {
		this.readShared();
		this.index.onChange((ids) => {
			let touched = false;
			for (const id of ids) {
				if (id.startsWith(`${FOLDERS.book}/`) || id.startsWith(`${FOLDERS.manga}/`)) {
					// a pending silent edit keeps its copy until written
					if (!this.dirty.has(id)) this.views.delete(id);
					touched = true;
				}
			}
			if (touched) this.notifyListeners();
		});
		this.shared.onChange(() => {
			this.readShared();
			this.notifyListeners();
		});
		// additive reconcile: every future-dated item gets an Upcoming entry. Never removes, so
		// manually-scheduled recurring entries survive reloads.
		const dm = this.plugin.dataManager;
		if (dm) {
			for (const b of this.getBooks()) if (isReleaseDateFuture(b.releaseDate)) await dm.autoAddReadingToUpcoming(b, 'book');
			for (const m of this.getMangaList()) if (isReleaseDateFuture(m.releaseDate)) await dm.autoAddReadingToUpcoming(m, 'manga');
		}
		this.notifyListeners();
	}

	// Settings + columns (shared config)

	/** Composes the local (data.json) and shared (base) reading settings into memory; never writes. */
	private readShared(): void {
		const raw = { ...this.local.data.reading, ...(this.shared.get().settings.reading as object | undefined) } as Partial<ReadingSettings> & {
			bookColumns?: ReadingCustomColumn[];
			mangaColumns?: ReadingCustomColumn[];
		};
		const { bookColumns, mangaColumns, ...rest } = raw;
		const settings: ReadingSettings = { ...DEFAULT_READING_SETTINGS, ...rest };
		// "On Hold" was removed; never leave it as the default for new entries
		if ((settings.defaultStatus as string) === 'On Hold') settings.defaultStatus = 'Plan to Read';
		// status colours are user-editable — seed missing keys from the shipped defaults
		const colors: Record<string, string> = { ...DEFAULT_READING_STATUS_COLORS, ...(settings.statusColors ?? {}) };
		for (const status of READING_STATUSES) {
			if (typeof colors[status] !== 'string') colors[status] = DEFAULT_READING_STATUS_COLORS[status];
		}
		settings.statusColors = colors;
		this.settings = settings;
		const clean = (cols: unknown): ReadingCustomColumn[] =>
			(Array.isArray(cols) ? (cols as ReadingCustomColumn[]) : []).map((c) => ({
				...c,
				options: Array.isArray(c.options) ? c.options : [],
				color: c.color || '#5F5E5A',
			}));
		this.bookColumns = clean(bookColumns);
		this.mangaColumns = clean(mangaColumns);
		this.index.setColumns(this.bookColumns, this.mangaColumns);
	}

	/** Synced keys go to the base, the rest (colors, layout, filters) to data.json. */
	private async saveShared(): Promise<void> {
		const all = { ...this.settings, bookColumns: this.bookColumns, mangaColumns: this.mangaColumns };
		const { shared, local } = splitNested('reading', all);
		this.local.data.reading = local;
		this.local.queueSave();
		await this.shared.update({ reading: shared });
	}

	/** Current dataset as a backup snapshot. */
	exportSnapshot(): ReadingData {
		return {
			books: this.getBooks(),
			manga: this.getMangaList(),
			bookColumns: this.bookColumns,
			mangaColumns: this.mangaColumns,
			settings: this.settings,
		};
	}

	getSettings(): ReadingSettings {
		return this.settings;
	}

	async updateSettings(patch: Partial<ReadingSettings>): Promise<void> {
		this.settings = { ...this.settings, ...patch };
		await this.save();
	}

	/**
	 * Persist without notifying — for state the rendering tab wrote itself (the rows layout): it
	 * re-renders on its own.
	 */
	persistQuiet(): void {
		void this.saveShared().catch((e) => console.warn('[Hoard] ReadingDataManager.save failed:', e));
	}

	private async save(): Promise<void> {
		this.index.setColumns(this.bookColumns, this.mangaColumns);
		try {
			await this.saveShared();
		} catch (e) {
			console.warn('[Hoard] ReadingDataManager.save failed:', e);
		}
		this.notifyListeners();
	}

	/** Writes items changed via the silent updaters, then notifies. */
	async saveAndNotify(): Promise<void> {
		await this.writeDirty();
		this.notifyListeners();
	}

	private async writeDirty(): Promise<void> {
		const ids = [...this.dirty];
		this.dirty.clear();
		for (const id of ids) {
			const kind = this.kindOf(id);
			const slot = this.views.get(id);
			if (kind && slot) {
				try { await this.writeItem(kind, slot.view); } catch (e) { console.warn('[Hoard] reading note write failed:', e); }
			} else {
				this.notify({ code: 'editLost', id });
			}
		}
	}

	/** Writes pending silent edits now, without notifying (plugin unload). */
	async flushPending(): Promise<void> {
		await this.writeDirty();
	}

	/**
	 * Silent favorite toggle: note only, deliberately no dateModified stamp — a favorite is not a
	 * content edit and must not bubble the item up recently-modified orderings.
	 */
	async setFavorite(kind: ReadingKind, id: string, favorite: boolean): Promise<void> {
		const item = kind === 'book' ? this.getBook(id) : this.getManga(id);
		if (!item) return;
		item.favorite = favorite;
		// stamp drives the Favorites shelf order (newest first); cleared on unfavorite
		if (favorite) item.dateFavorited = new Date().toISOString();
		else delete item.dateFavorited;
		try { await this.writeItem(kind, item); } catch (e) {
			console.warn('[Hoard] setFavorite note write failed:', e);
		}
	}

	// Listeners

	onChange(listener: () => void): void {
		this.listeners.add(listener);
	}

	offChange(listener: () => void): void {
		this.listeners.remove(listener);
	}

	notifyChange(): void {
		this.notifyListeners();
	}

	private notifyListeners(): void {
		this.listeners.emit();
	}

	/**
	 * Restores settings, columns and entries from a backup. Entries whose note already exists (same
	 * title) are left alone; the rest get a fresh note.
	 */
	async restore(data: ReadingData): Promise<void> {
		const { books = [], manga = [] } = data;
		const { settings, bookColumns, mangaColumns } = data;
		this.settings = { ...DEFAULT_READING_SETTINGS, ...(settings ?? {}) };
		this.bookColumns = Array.isArray(bookColumns) ? bookColumns : [];
		this.mangaColumns = Array.isArray(mangaColumns) ? mangaColumns : [];
		await this.saveShared();
		this.readShared();
		const layout = this.layout();
		for (const [kind, list] of [['book', books], ['manga', manga]] as const) {
			for (const item of list as ReadingItem[]) {
				if (this.app.vault.getAbstractFileByPath(layout.notePath(kind, item.title))) continue;
				await this.createNote(kind, { ...item });
			}
		}
		this.notifyListeners();
	}

	// Silent cover updates

	/**
	 * Silent cover URL update for the lazy Cards re-fetch: written to the note's `Cover` only when
	 * that is empty (E12), no notify — the card swaps its own <img>, so the grid is not rebuilt and
	 * scroll survives.
	 */
	async updateCoverUrl(kind: ReadingKind, id: string, url: string): Promise<void> {
		const item = kind === 'book' ? this.getBook(id) : this.getManga(id);
		if (!item || !url || item.coverUrl) return;
		if (this.dirty.has(id)) {
			// the pending write carries it
			item.coverUrl = url;
			return;
		}
		const file = this.fileOf(id);
		if (!file) return;
		await this.processFrontMatter(file, kind, item, (raw) => {
			const current = raw[COMMON_PROPS.cover];
			const own = typeof current === 'string' ? current.trim() : '';
			if (own) {
				item.coverUrl = own;
				return;
			}
			raw[COMMON_PROPS.cover] = url;
			item.coverUrl = url;
		}, true);
	}

	/**
	 * Like updateCoverUrl, for a cover found by a title-based lookup (CSV-imported entries without
	 * cover or ID). The resolved source ID is identity data of the note, which a background fetch does
	 * not write; only the cover is kept.
	 */
	updateCoverAndSource(kind: ReadingKind, id: string, url: string, _sourceId: string): Promise<void> {
		return this.updateCoverUrl(kind, id, url);
	}

	// Reading → Upcoming and release status

	/**
	 * Forces "To be released" when the release date is in the future and reverts to "Plan to Read"
	 * once it passes or is cleared. Returns true if the status changed.
	 */
	private applyReleaseStatus(item: ReadingItem): boolean {
		const future = isReleaseDateFuture(item.releaseDate);
		if (future) {
			if (item.status !== 'To be released') {
				item.status = 'To be released';
				return true;
			}
		} else if (item.status === 'To be released') {
			item.status = 'Plan to Read';
			return true;
		}
		return false;
	}

	/**
	 * Mirrors the watchlist auto-add: a reading item with a future release date joins the shared
	 * Upcoming tracker and leaves once the date passes or is cleared.
	 */
	private async syncUpcoming(item: ReadingItem, kind: ReadingKind): Promise<void> {
		const dm = this.plugin.dataManager;
		if (!dm) return;
		if (isReleaseDateFuture(item.releaseDate)) {
			await dm.autoAddReadingToUpcoming(item, kind);
		} else {
			await dm.removeReadingAirtimeEntries(item.id);
		}
	}

	// Views

	private kindOf(id: string): ReadingKind | null {
		const k = this.index.get(id)?.kind;
		return k === 'book' || k === 'manga' ? k : null;
	}

	/** UI copy of an index entry: stable while the entry is unchanged, full vault path, release status applied. */
	private viewOf(src: ReadingItem): ReadingItem {
		const slot = this.views.get(src.id);
		if (slot && slot.src === src) return slot.view;
		const view = {
			...src,
			customFields: { ...(src.customFields ?? {}) },
			...(src.groups ? { groups: [...src.groups] } : {}),
			vaultPage: this.layout().pathFromId(src.id),
		};
		this.applyReleaseStatus(view);
		this.views.set(src.id, { src, view });
		setBaseline(view, src);
		return view;
	}

	// Books CRUD

	getBooks(): Book[] {
		return this.index.books().map((b) => this.viewOf(b) as Book);
	}

	getBook(id: string): Book | undefined {
		const e = this.index.get(id);
		return e?.kind === 'book' ? (this.viewOf(e.entry) as Book) : undefined;
	}

	async addBook(book: Book): Promise<void> {
		this.applyReleaseStatus(book);
		await this.createNote('book', book);
		this.notifyListeners();
		await this.syncUpcoming(book, 'book');
		void this.historyManager?.log(
			`${book.title} (Book) was added`,
			{ source: 'Reading', action: 'added', titleName: book.title, titleId: book.id },
		);
	}

	async updateBook(updated: Book): Promise<void> {
		await this.updateItem('book', updated, 'Book');
	}

	updateBookSilent(updated: Book): void {
		this.updateSilent(updated);
	}

	async removeBook(id: string): Promise<void> {
		await this.removeItem('book', id, 'Book');
	}

	/**
	 * Insert many books in one shot: notes first, then per-item Upcoming reconcile and history
	 * (mirrors addTitleBatch). Used by the chunked CSV import.
	 */
	async addBookBatch(books: Book[]): Promise<void> {
		for (const book of books) {
			this.applyReleaseStatus(book);
			try { await this.createNote('book', book); } catch (e) { console.warn('[Hoard] reading note create failed:', e); continue; }
			await this.syncUpcoming(book, 'book');
			void this.historyManager?.log(
				`${book.title} (Book) was added`,
				{ source: 'Reading', action: 'added', titleName: book.title, titleId: book.id },
			);
		}
	}

	async removeBooksBatch(ids: string[]): Promise<void> {
		await this.removeBatch('book', ids, 'Book');
	}

	/** Id a new book titled `title` would get (its note path below the root). */
	generateBookId(title: string): string {
		return this.predictId('book', title);
	}

	// Manga CRUD

	getMangaList(): Manga[] {
		return this.index.manga().map((m) => this.viewOf(m) as Manga);
	}

	getManga(id: string): Manga | undefined {
		const e = this.index.get(id);
		return e?.kind === 'manga' ? (this.viewOf(e.entry) as Manga) : undefined;
	}

	async addManga(manga: Manga): Promise<void> {
		this.applyReleaseStatus(manga);
		await this.createNote('manga', manga);
		this.notifyListeners();
		await this.syncUpcoming(manga, 'manga');
		void this.historyManager?.log(
			`${manga.title} (Manga) was added`,
			{ source: 'Reading', action: 'added', titleName: manga.title, titleId: manga.id },
		);
	}

	async updateManga(updated: Manga): Promise<void> {
		await this.updateItem('manga', updated, 'Manga');
	}

	updateMangaSilent(updated: Manga): void {
		this.updateSilent(updated);
	}

	async removeManga(id: string): Promise<void> {
		await this.removeItem('manga', id, 'Manga');
	}

	async removeMangaBatch(ids: string[]): Promise<void> {
		await this.removeBatch('manga', ids, 'Manga');
	}

	/**
	 * Insert many manga in one shot: notes first, then per-item Upcoming reconcile and history.
	 * Used by the chunked CSV import.
	 */
	async addMangaBatch(mangaList: Manga[]): Promise<void> {
		for (const manga of mangaList) {
			this.applyReleaseStatus(manga);
			try { await this.createNote('manga', manga); } catch (e) { console.warn('[Hoard] reading note create failed:', e); continue; }
			await this.syncUpcoming(manga, 'manga');
			void this.historyManager?.log(
				`${manga.title} (Manga) was added`,
				{ source: 'Reading', action: 'added', titleName: manga.title, titleId: manga.id },
			);
		}
	}

	/** Id a new manga titled `title` would get (its note path below the root). */
	generateMangaId(title: string): string {
		return this.predictId('manga', title);
	}

	private predictId(kind: ReadingKind, title: string): string {
		const layout = this.layout();
		return layout.idFromPath(freeNotePath(this.app, layout.notePath(kind, title)));
	}

	// Shared update/remove flows

	private async updateItem(kind: ReadingKind, updated: ReadingItem, label: string): Promise<void> {
		const src = this.sourceOf(kind, updated.id);
		if (!src) return;
		updated.dateModified = new Date().toISOString();
		this.applyReleaseStatus(updated);
		const name = updated.title;
		if (src.status !== updated.status) {
			const act = updated.status === 'Completed' ? 'completed' as const : 'status' as const;
			// mirror the watch behavior: stamp today's finish date on the transition to Completed
			if (updated.status === 'Completed' && this.plugin.settings.setFinishDateAutomatically && !updated.dateFinished) {
				updated.dateFinished = todayIso();
			}
			void this.historyManager?.log(
				`${name} (${label}) status changed to ${updated.status}`,
				{ source: 'Reading', action: act, titleName: name, titleId: updated.id },
			);
		}
		if (src.rating !== updated.rating) {
			void this.historyManager?.log(
				`${name} (${label}) Rating → ${updated.rating}/5`,
				{ source: 'Reading', action: 'rating', titleName: name, titleId: updated.id },
			);
		}
		const oldReleaseDate = src.releaseDate;
		try { await this.writeItem(kind, updated); } catch (e) { console.warn('[Hoard] reading note write failed:', e); }
		this.notifyListeners();
		// reconcile Upcoming only when the release date actually changed, so rating/status/progress edits
		// never disturb a manual recurring entry
		if (oldReleaseDate !== updated.releaseDate) await this.syncUpcoming(updated, kind);
	}

	private updateSilent(updated: ReadingItem): void {
		const id = updated.id;
		const slot = this.views.get(id);
		const src = getBaseline(updated) ?? slot?.src ?? this.sourceOf(this.kindOf(id) ?? 'book', id);
		if (!src) return;
		updated.dateModified = new Date().toISOString();
		this.applyReleaseStatus(updated);
		this.views.set(id, { src, view: updated });
		setBaseline(updated, src);
		this.dirty.add(id);
	}

	private async removeItem(kind: ReadingKind, id: string, label: string): Promise<void> {
		const item = kind === 'book' ? this.getBook(id) : this.getManga(id);
		await this.deleteNote(id);
		this.notifyListeners();
		await this.plugin.dataManager?.removeReadingAirtimeEntries(id);
		if (item) {
			void this.historyManager?.log(
				`${item.title} (${label}) was deleted`,
				{ source: 'Reading', action: 'deleted', titleName: item.title, titleId: item.id },
			);
		}
	}

	private async removeBatch(kind: ReadingKind, ids: string[], label: string): Promise<void> {
		const items = ids.map((id) => (kind === 'book' ? this.getBook(id) : this.getManga(id))).filter((x): x is ReadingItem => !!x);
		for (const id of ids) await this.deleteNote(id).catch(() => {});
		this.notifyListeners();
		for (const id of ids) await this.plugin.dataManager?.removeReadingAirtimeEntries(id);
		for (const item of items) {
			void this.historyManager?.log(
				`${item.title} (${label}) was deleted`,
				{ source: 'Reading', action: 'deleted', titleName: item.title, titleId: item.id },
			);
		}
	}

	/** Index entry (the stored state) for an id, or the baseline of an existing view. */
	private sourceOf(kind: ReadingKind, id: string): ReadingItem | undefined {
		const e = this.index.get(id);
		return e?.kind === kind ? e.entry : this.views.get(id)?.src;
	}

	// Custom columns CRUD

	getBookColumns(): ReadingCustomColumn[] {
		return this.bookColumns;
	}

	getMangaColumns(): ReadingCustomColumn[] {
		return this.mangaColumns;
	}

	private encode(kind: ReadingKind, item: ReadingItem): Fm {
		return encodeWith(kind, item, this.columnsFor(kind));
	}

	/** True when another column of this kind already has `name` (case-insensitive). */
	isColumnNameTaken(kind: ReadingKind, name: string, exceptId?: string): boolean {
		return columnNameTaken(this.columnsFor(kind), name, exceptId);
	}

	private columnsFor(kind: ReadingKind): ReadingCustomColumn[] {
		return kind === 'book' ? this.bookColumns : this.mangaColumns;
	}

	async addColumn(kind: ReadingKind, column: ReadingCustomColumn): Promise<void> {
		this.columnsFor(kind).push(column);
		await this.save();
	}

	/**
	 * Saves the column. A new name first moves `Custom <old>` to `Custom <new>` in every note of the
	 * kind (notes before the setting: a crash in between leaves the values in the notes under the new
	 * name, never lost). Returns how many notes were moved and how many skipped (they already have the
	 * new key, or could not be updated; their values stay as they are).
	 */
	async updateColumn(kind: ReadingKind, updated: ReadingCustomColumn): Promise<ColumnMoveResult> {
		const old = this.columnsFor(kind).find((c) => c.id === updated.id);
		if (!old) return { moved: 0, skipped: 0 };
		const result =
			old.name === updated.name
				? { moved: 0, skipped: 0 }
				: await this.moveCustomKey(kind, customFieldKey(old.name), customFieldKey(updated.name));
		// the shared config may have been reloaded meanwhile: resolve the array again, never resurrect a deleted column
		const cols = this.columnsFor(kind);
		const idx = cols.findIndex((c) => c.id === updated.id);
		if (idx < 0) return result;
		cols[idx] = updated;
		await this.save();
		return result;
	}

	private async moveCustomKey(kind: ReadingKind, from: string, to: string): Promise<ColumnMoveResult> {
		const items: ReadingItem[] = kind === 'book' ? this.index.books() : this.index.manga();
		let moved = 0;
		let skipped = 0;
		for (const item of items) {
			const file = this.fileOf(item.id);
			// the file decides, not the metadata cache, which may lag behind a sync
			if (!file || from === to || !(await this.fileHasKey(file, from))) continue;
			let hit = false;
			let conflict = false;
			const ok = await updateFrontMatter(this.app, file, this.notify, (fm: Fm) => {
				if (!(from in fm)) return;
				if (to in fm) {
					console.warn(`[Hoard] ${file.path} already has "${to}"; "${from}" stays`);
					conflict = true;
					return;
				}
				// rename in place: the key keeps its position among its neighbours
				const entries = Object.entries(fm).map(([k, v]): [string, unknown] => [k === from ? to : k, v]);
				for (const k of Object.keys(fm)) delete fm[k];
				for (const [k, v] of entries) fm[k] = v;
				hit = true;
			});
			if (ok && hit) moved++;
			else if (conflict || !ok) skipped++;
		}
		return { moved, skipped };
	}

	/** True when the note's properties, read from the file, contain `key`; unreadable YAML counts when it names the key. */
	private async fileHasKey(file: TFile, key: string): Promise<boolean> {
		const info = getFrontMatterInfo(await this.app.vault.read(file));
		if (!info.exists) return false;
		try {
			const fm: unknown = parseYaml(info.frontmatter);
			return typeof fm === 'object' && fm !== null && key in fm;
		} catch {
			return info.frontmatter.includes(key);
		}
	}

	async removeColumn(kind: ReadingKind, id: string): Promise<void> {
		// the values stay in the notes: they are the user's data
		if (kind === 'book') this.bookColumns = this.bookColumns.filter((c) => c.id !== id);
		else this.mangaColumns = this.mangaColumns.filter((c) => c.id !== id);
		await this.save();
	}

	generateColumnId(kind: ReadingKind, name: string): string {
		const base = `col-${slugify(name) || 'field'}`;
		const existing = new Set(this.columnsFor(kind).map((c) => c.id));
		if (!existing.has(base)) return base;
		let counter = 2;
		while (existing.has(`${base}-${counter}`)) counter++;
		return `${base}-${counter}`;
	}

	async reorderColumns(kind: ReadingKind, fromIdx: number, toIdx: number): Promise<void> {
		const cols = this.columnsFor(kind);
		if (fromIdx < 0 || fromIdx >= cols.length || toIdx < 0 || toIdx >= cols.length) return;
		const [moved] = cols.splice(fromIdx, 1);
		if (!moved) return;
		cols.splice(toIdx, 0, moved);
		await this.save();
	}

	// Custom field values

	async setCustomField(
		kind: ReadingKind,
		itemId: string,
		columnId: string,
		value: string | number | null,
	): Promise<void> {
		const item = kind === 'book' ? this.getBook(itemId) : this.getManga(itemId);
		if (!item) return;
		if (!item.customFields) item.customFields = {};
		if (value === null || value === '') {
			delete item.customFields[columnId];
		} else {
			item.customFields[columnId] = value;
		}
		item.dateModified = new Date().toISOString();
		try { await this.writeItem(kind, item); } catch (e) { console.warn('[Hoard] reading note write failed:', e); }
		this.notifyListeners();
	}

	// Reading note files

	/** Path of the note for `title`: the existing entry's note when there is one, else the path a new one gets. */
	noteFilePath(kind: ReadingKind, title: string): string {
		const layout = this.layout();
		const list: ReadingItem[] = kind === 'book' ? this.index.books() : this.index.manga();
		const hit = list.find((e) => e.title === title);
		return hit ? layout.pathFromId(hit.id) : layout.notePath(kind, title);
	}

	private fileOf(id: string): TFile | null {
		return noteFile(this.app, this.layout().pathFromId(id));
	}

	/** True when `item` was made from the stored state of its note (or nothing is stored yet). */
	private basedOnStored(item: ReadingItem): boolean {
		const current = this.index.get(item.id);
		if (current?.kind !== 'book' && current?.kind !== 'manga') return true;
		const base = getBaseline(item) ?? this.views.get(item.id)?.src;
		return !!base && sameStoredState(base, current.entry);
	}

	/**
	 * Cache + optimistic index update after an own write. `item` becomes the UI's copy only when it was
	 * made from the stored state; for a stale copy the next read builds a fresh one.
	 */
	private afterWrite(kind: ReadingKind, item: ReadingItem, fm: Fm, background = false): void {
		const fresh = this.basedOnStored(item);
		const stored = kind === 'book' ? decodeBook(item.id, fm, this.bookColumns).entry : decodeManga(item.id, fm, this.mangaColumns).entry;
		this.index.applyLocal(kind === 'book'
			? { kind: 'book', entry: stored as Book }
			: { kind: 'manga', entry: stored as Manga }, { background });
		item.vaultPage = this.layout().pathFromId(item.id);
		if (!fresh) return;
		this.views.set(item.id, { src: stored, view: item });
		setBaseline(item, stored);
	}

	/**
	 * processFrontMatter, then the optimistic index update — inside the callback, so it lands before
	 * the write's `changed` event can be seen. False (and a notice) on unreadable YAML.
	 * `background` marks an automatic fill (no user write).
	 */
	private async processFrontMatter(
		file: TFile,
		kind: ReadingKind,
		item: ReadingItem,
		fn: (fm: Fm) => void,
		background = false,
	): Promise<boolean> {
		return updateFrontMatter(this.app, file, this.notify, (fm: Fm) => {
			fn(fm);
			this.afterWrite(kind, item, { ...fm }, background);
		});
	}

	/** Creates the note for a new entry; the entry's id becomes the note path. */
	private async createNote(kind: ReadingKind, item: ReadingItem): Promise<void> {
		const layout = this.layout();
		const path = freeNotePath(this.app, layout.notePath(kind, item.title));
		await ensureFolder(this.app, parentOf(path));
		const fm = this.encode(kind, item);
		item.id = layout.idFromPath(path);
		// index first, so the create event finds nothing new
		this.afterWrite(kind, item, fm);
		try {
			await this.app.vault.create(path, `---\n${stringifyYaml(fm)}---\n\n## Notes\n\n\n## Quotes\n`);
		} catch (e) {
			this.index.removeLocal(item.id);
			this.views.delete(item.id);
			throw e;
		}
	}

	/** What the write pipeline needs to know about a book or a manga. */
	private writeHooks(kind: ReadingKind): EntryWriteHooks<ReadingItem> {
		return {
			baselineOf: (item) => getBaseline(item) ?? this.views.get(item.id)?.src ?? this.sourceOf(kind, item.id),
			movedPath: (src, item) => (item.title !== src.title ? this.layout().notePath(kind, item.title) : null),
			moveId: (from, to) => this.moveId(from, to),
			prepare: () => (x) => this.encode(kind, x),
			afterWrite: (item, fm) => this.afterWrite(kind, item, fm),
			isLiveCopy: (item) => this.views.get(item.id)?.view === item,
			// a copy made from the stored state becomes the live one, with a slot of its own if it had none
			unchanged: (item, src) => {
				if (src && this.basedOnStored(item)) this.views.set(item.id, { src, view: item });
			},
			create: (item) => this.createNote(kind, item),
		};
	}

	/** Drops what is held under the old id of a renamed note; a pending silent edit follows to the new id. */
	private moveId(from: string, to: string): void {
		this.index.removeLocal(from);
		this.views.delete(from);
		if (this.dirty.delete(from)) this.dirty.add(to);
	}

	/** Writes an entry to its note through the shared pipeline (`writeEntry`); creates the note when missing. */
	private async writeItem(kind: ReadingKind, item: ReadingItem): Promise<void> {
		await writeEntry({ app: this.app, layout: this.layout, notify: this.notify }, this.writeHooks(kind), item);
	}

	private async deleteNote(id: string): Promise<void> {
		await trashNote(this.app, this.layout().pathFromId(id));
		this.index.removeLocal(id);
		this.views.delete(id);
		this.dirty.delete(id);
	}

	/** Writes (creates or updates) the note file. Returns its path. */
	async writeReadingNote(kind: ReadingKind, item: ReadingItem): Promise<string> {
		await this.writeItem(kind, item);
		return this.layout().pathFromId(item.id);
	}

	async ensureReadingNote(kind: ReadingKind, item: ReadingItem): Promise<string> {
		if (this.fileOf(item.id)) return this.layout().pathFromId(item.id);
		return this.writeReadingNote(kind, item);
	}

	/** Creates the note file only if missing; true when one was created. */
	async createReadingNoteIfMissing(kind: ReadingKind, item: ReadingItem): Promise<boolean> {
		if (this.fileOf(item.id)) return false;
		await this.createNote(kind, item);
		return true;
	}

	/**
	 * Rewrites every plugin-owned frontmatter key of an existing reading note, body verbatim. Keys the
	 * encoder omits are removed, except fields the decoder could not read. Does NOT create the file
	 * when missing — returns false. Used by the bulk "Rewrite all frontmatter" action.
	 */
	async rewriteFrontmatterIfExists(kind: ReadingKind, item: ReadingItem): Promise<boolean> {
		const file = this.fileOf(item.id);
		if (!file) return false;
		const out = this.encode(kind, item);
		const keep = new Set(this.index.invalidFields(item.id));
		return this.processFrontMatter(file, kind, item, (raw) => {
			for (const key of KIND_KEYS[kind]) {
				if (key in out) {
					if (!keep.has(key) || !(key in raw)) raw[key] = out[key];
				} else if (!keep.has(key)) {
					delete raw[key];
				}
			}
			// custom values are user data: written when the item has one, never deleted
			for (const key of Object.keys(out)) {
				if (key.startsWith(CUSTOM_FIELD_PREFIX) && (!keep.has(key) || !(key in raw))) raw[key] = out[key];
			}
		});
	}

	async readReadingNote(_kind: ReadingKind, item: ReadingItem): Promise<string | null> {
		const file = this.fileOf(item.id);
		return file ? this.app.vault.read(file) : null;
	}

	/** Appends a `> [!quote]` callout to the ## Quotes section, creating it if missing. */
	async appendQuote(
		kind: ReadingKind,
		item: ReadingItem,
		text: string,
		reference: string,
	): Promise<void> {
		await this.ensureReadingNote(kind, item);
		const file = this.fileOf(item.id);
		if (!file) return;

		const refTrim = reference.trim();
		const titlePart = refTrim ? ` ${refTrim}` : '';
		const bodyLines = text
			.split(/\r?\n/)
			.map((l) => `> ${l}`)
			.join('\n');
		const callout = `> [!quote]${titlePart}\n${bodyLines}`;

		await this.app.vault.process(file, (current) => {
			const quotesMatch = current.match(/(^|\n)## Quotes[ \t]*\r?\n/);
			if (quotesMatch && quotesMatch.index !== undefined) {
				const insertAt = quotesMatch.index + quotesMatch[0].length;
				const before = current.slice(0, insertAt);
				const after = current.slice(insertAt);
				const needsLeadingNl = before.length > 0 && !before.endsWith('\n\n');
				return `${before}${needsLeadingNl ? '\n' : ''}${callout}\n${after.startsWith('\n') ? '' : '\n'}${after}`;
			}
			const sep = current.endsWith('\n') ? '' : '\n';
			return `${current}${sep}\n## Quotes\n\n${callout}\n`;
		});
	}
}
