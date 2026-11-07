import type HoardPlugin from './main';
import { formatDateDisplay } from './types';
import type { HistoryStore } from './storage/HistoryStore';

export type HistorySource = 'Watchlist' | 'Reading' | 'Games';
export type HistoryAction = 'added' | 'completed' | 'deleted' | 'status' | 'rating' | 'watched' | 'group';

export interface HistoryEntry {
	id: string;
	timestamp: string;
	message: string;
	source?: HistorySource;
	action?: HistoryAction;
	titleName?: string;
	/** Note id of the title (C1); history lines link to it. */
	titleId?: string;
}

/**
 * Resolve an entry's action: structured metadata when present, else parsed from the message
 * string. Shared by the Log tab and the Rows view's Recently Watched shelf.
 */
export function inferHistoryAction(entry: HistoryEntry): HistoryAction {
	if (entry.action) return entry.action;
	const m = entry.message.toLowerCase();
	if (m.startsWith('group "') && m.includes('was created')) return 'group';
	if (m.includes('was added')) return 'added';
	if (m.includes('was deleted')) return 'deleted';
	if (m.includes('was reviewed') || m.includes('rating changed')) return 'rating';
	if (m.includes('episode') && m.includes('watched')) return 'watched';
	if (m.includes('was marked as watched') || m.includes('completed')) return 'completed';
	if (m.includes('status')) return 'status';
	return 'added';
}

/** Entries logged before structured metadata are all Watchlist events. */
export function inferHistorySource(entry: HistoryEntry): HistorySource {
	return entry.source ?? 'Watchlist';
}

export interface WatchedTitle { id: string; title: string; type: string }

/** Several titles share a name or basename: the plain message embeds "(Type)". */
function pickByType<T extends WatchedTitle>(candidates: T[], entry: HistoryEntry): T | undefined {
	if (candidates.length <= 1) return candidates[0];
	const type = /\(([^)]+)\)/.exec(entry.message)?.[1];
	return candidates.find((t) => t.type === type) ?? candidates[0];
}

/**
 * Resolves one entry to a title: exact note id, then the basename of a link Obsidian shortened
 * after a rename, then the title name (entries without an id). Undefined when the title is gone.
 */
function resolveEntryTitle<T extends WatchedTitle>(entry: HistoryEntry, titles: T[], byId: Map<string, T>): T | undefined {
	if (entry.titleId) {
		const exact = byId.get(entry.titleId);
		if (exact) return exact;
		const base = entry.titleId.split('/').pop() ?? entry.titleId;
		const short = pickByType(titles.filter((t) => t.id === base || t.id.endsWith(`/${base}`)), entry);
		if (short) return short;
	}
	const name = entry.titleName ?? /^(.+?)\s*\(/.exec(entry.message)?.[1];
	return name ? pickByType(titles.filter((t) => t.title === name), entry) : undefined;
}

/**
 * Titles with a real watch event (Watchlist `watched`/`completed`), in entry order (pass newest
 * first), without duplicates, at most `limit`. Entries whose title no longer exists are skipped.
 */
export function resolveRecentlyWatched<T extends WatchedTitle>(entries: HistoryEntry[], titles: T[], limit = 10): T[] {
	const byId = new Map(titles.map((t) => [t.id, t]));
	const out: T[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		if (out.length >= limit) break;
		if (inferHistorySource(entry) !== 'Watchlist') continue;
		const action = inferHistoryAction(entry);
		if (action !== 'watched' && action !== 'completed') continue;
		const title = resolveEntryTitle(entry, titles, byId);
		if (!title || seen.has(title.id)) continue;
		seen.add(title.id);
		out.push(title);
	}
	return out;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Renders a log timestamp in the user's date format. This is baked into `message` at write time, so
 * entries keep whatever format was active when logged — the Log tab renders from the structured
 * metadata and its own timestamp, so old entries still display consistently.
 */
export function formatHistoryDate(isoTs: string): string {
	const d = new Date(isoTs);
	const day = DAYS[d.getDay()] ?? '';
	const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const hh = String(d.getHours()).padStart(2, '0');
	const min = String(d.getMinutes()).padStart(2, '0');
	return `${day} ${formatDateDisplay(local)} at ${hh}:${min}`;
}

export class HistoryManager {
	private entries: HistoryEntry[] = [];
	private listeners: (() => void)[] = [];

	/** Without a store the log is memory-only (before the vault storage is wired). */
	constructor(private plugin: HoardPlugin, private store: HistoryStore | null = null) {}

	/** Reads History.md (from the vault) into memory. */
	async load(): Promise<void> {
		this.entries = this.store ? await this.store.load() : [];
	}

	/** Loads and starts watching History.md; external edits reload and notify. */
	async start(): Promise<void> {
		await this.load();
		this.store?.start(() => {
			void this.load().then(() => this.listeners.forEach((cb) => cb()));
		});
		this.listeners.forEach((cb) => cb());
	}

	onChange(cb: () => void): void {
		this.listeners.push(cb);
	}

	offChange(cb: () => void): void {
		this.listeners = this.listeners.filter((l) => l !== cb);
	}

	async log(
		message: string,
		meta?: { source?: HistorySource; action?: HistoryAction; titleName?: string; titleId?: string },
	): Promise<void> {
		const entry: HistoryEntry = {
			id: '',
			timestamp: new Date().toISOString(),
			message,
			source: meta?.source,
			action: meta?.action,
			titleName: meta?.titleName,
			titleId: meta?.titleId,
		};
		// optimistic, so getEntries() is current immediately; ids are replaced on the next load
		entry.id = `${entry.timestamp}#${this.entries.length}`;
		this.entries.push(entry);
		if (this.entries.length > this.MAX_ENTRIES) this.entries = this.entries.slice(-this.MAX_ENTRIES);
		try {
			await this.store?.append(entry);
		} catch {
			// write errors are non-fatal
		}
	}

	private readonly MAX_ENTRIES = 1000;

	getEntries(): HistoryEntry[] {
		return [...this.entries].reverse();
	}

	/** Drop one entry by id. No-op when the id is gone (external reload). */
	async deleteEntry(id: string): Promise<void> {
		const next = this.entries.filter((e) => e.id !== id);
		if (next.length === this.entries.length) return;
		await this.replace(next);
	}

	/** Raw stored entries (oldest-first), for a full backup. */
	exportEntries(): HistoryEntry[] {
		return [...this.entries];
	}

	/** Replace the entire audit log (full-snapshot restore). */
	async restore(entries: HistoryEntry[]): Promise<void> {
		const list = Array.isArray(entries) ? entries : [];
		await this.replace(list.length > this.MAX_ENTRIES ? list.slice(-this.MAX_ENTRIES) : list);
	}

	private async replace(list: HistoryEntry[]): Promise<void> {
		this.entries = list;
		try {
			await this.store?.replaceAll(list);
			await this.load(); // fresh line-index ids
		} catch {
			// write errors are non-fatal
		}
	}
}
