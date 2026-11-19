import { parsePlaytimeInput } from '../../../../shared/domain/format';
import { GAME_TBA_STATUS, defaultGamesSettings } from '../../../../shared/domain/gameDefaults';
import { COLUMN_TYPES } from '../../../../shared/domain/columns';
import { getTitleCredits } from '../../../../shared/domain/titles';
import type { Game, GamesData, GamesSettings } from '../../../games/contract';
import type { ReadingCustomColumn, ReadingData } from '../../../reading/contract';
import type { HoardTitle } from '../../../watchlist/contract';
import type { TagDefinition } from '../../../../shared/domain/tags';
import { readBook, readGame, readGameGroup, readManga } from '../../../../shared/storage/entryReaders';
import { readGamesSettings, readReadingSettings } from '../../../../shared/storage/featureSettings';
import { at, readList, readOneOf, readOptionalString, readRecord, readString, readStringList } from '../../../../shared/domain/read';
import { defined } from '../../../../shared/domain/sharedHelpers';
import { TITLE_PROPS } from '../../../../shared/storage/properties';
import { WISHLIST, type WatchLogTitle } from './schema1Types';
import type { Fm } from '../../../../shared/storage/storageTypes';

// WatchLog's load-time corrections, applied once while converting its data.

const PLATFORM_COLOR = '#888780';

export function isoOf(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** API-derived keys WatchLog wrote into a title note, with the values it wrote. */
export function watchLogApiValues(t: HoardTitle): Fm {
	const out: Fm = {};
	if (t.communityRating !== undefined) out[TITLE_PROPS.communityRating] = t.communityRating;
	if (t.communityVotes !== undefined) out[TITLE_PROPS.communityVotes] = t.communityVotes;
	if (t.communitySource) out[TITLE_PROPS.communitySource] = t.communitySource;
	for (const field of ['director', 'cast', 'studio'] as const) {
		const names = getTitleCredits(t, field);
		if (names.length > 0) out[TITLE_PROPS[field]] = names;
	}
	// the fetched trailer only: a manual one in the note is the user's
	if (t.trailerUrl) out[TITLE_PROPS.trailer] = t.trailerUrl;
	return out;
}

export function progressOf(t: HoardTitle): number {
	const skipped = t.seasons.reduce((n, s) => n + (s.skippedEpisodes?.length ?? 0), 0);
	const effective = Math.max(0, t.totalEpisodes - skipped);
	return effective === 0 ? 0 : Math.min(100, Math.round((t.watchedEpisodes.length / effective) * 100));
}

/**
 * The entries of a list that `read` accepts; the others are noted in `skipped` as `<label> <position>`.
 * Anything that is no list at all has no entries.
 */
export function readEntries<T>(raw: unknown, read: (v: unknown) => T | undefined, label: string, skipped: string[]): T[] {
	const out: T[] = [];
	if (!Array.isArray(raw)) return out;
	const items: unknown[] = raw;
	items.forEach((item, i) => {
		const entry = read(item);
		if (entry === undefined) skipped.push(`${label} ${i + 1}`);
		else out.push(entry);
	});
	return out;
}

export function normalizeTitle(raw: Record<string, unknown>): WatchLogTitle {
	const t: WatchLogTitle = {
		id: '', title: '', type: 'TV Show', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0,
		notes: '', dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 0,
		episodeDuration: 0, releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [],
		...raw,
	};
	if (!Array.isArray(t.seasons)) t.seasons = [];
	if (!Array.isArray(t.watchedEpisodes)) t.watchedEpisodes = [];
	if (typeof t.notes !== 'string') t.notes = '';
	if (typeof t.externalLink !== 'string') t.externalLink = '';
	return t;
}

function readColumn(v: unknown): ReadingCustomColumn | undefined {
	const id = at(v, 'id');
	if (typeof id !== 'string') return undefined;
	return {
		id,
		name: readString(at(v, 'name')).trim(),
		type: readOneOf(at(v, 'type'), COLUMN_TYPES, 'text'),
		options: readStringList(at(v, 'options')),
		...defined({ color: readOptionalString(at(v, 'color')) }),
	};
}

/**
 * WatchLog never validated its columns. Every column gets a distinct, non-blank name (`Field 1` for a
 * blank or non-string one, ` 2`, ` 3` for a case-insensitive duplicate), so no value shares a note
 * key with another.
 */
function sanitizeColumns(raw: unknown): ReadingCustomColumn[] {
	const used = new Set<string>();
	let generated = 0;
	return readList(raw, readColumn).map((c) => {
		let name = c.name;
		let n = 1;
		while (!name || used.has(name.toLowerCase())) {
			if (c.name) name = `${c.name} ${++n}`;
			else name = `Field ${++generated}`;
		}
		used.add(name.toLowerCase());
		return { ...c, name };
	});
}

/** Custom values keyed by a column id that no column has; the import cannot place them. */
export function orphanValues(
	item: { customFields?: Record<string, unknown> }, columns: ReadingCustomColumn[],
): { column: string; value: string }[] {
	const known = new Set(columns.map((c) => c.id));
	return Object.entries(item.customFields ?? {})
		.filter(([id, v]) => !known.has(id) && v !== undefined && v !== null && v !== '')
		.map(([column, v]) => ({ column, value: String(v) }));
}

/** Reading data of unknown shape; books and manga without an id and a title are noted in `skipped`. */
export function normalizeReading(raw: unknown, skipped: string[] = []): ReadingData {
	return {
		books: readEntries(at(raw, 'books'), readBook, 'book', skipped),
		manga: readEntries(at(raw, 'manga'), readManga, 'manga', skipped),
		bookColumns: sanitizeColumns(at(raw, 'bookColumns')),
		mangaColumns: sanitizeColumns(at(raw, 'mangaColumns')),
		settings: readReadingSettings(readRecord(at(raw, 'settings'))),
	};
}

/** Platforms were once plain names; they become tags, other entries stay for the settings reader to judge. */
function platformTags(raw: unknown, known: readonly TagDefinition[]): unknown {
	if (!Array.isArray(raw)) return raw;
	const items: unknown[] = raw;
	return items.map((p) => (typeof p === 'string' ? { name: p, color: known.find((d) => d.name === p)?.color ?? PLATFORM_COLOR } : p));
}

/** 'Wishlist' is a flag now: the status goes (or becomes "To be released"), and so do its default and filter. */
function retireWishlist(s: GamesSettings): void {
	const idx = s.statuses.findIndex((st) => st.name === WISHLIST);
	if (idx !== -1) {
		if (s.statuses.some((st) => st.name === GAME_TBA_STATUS)) s.statuses.splice(idx, 1);
		else s.statuses[idx] = { name: GAME_TBA_STATUS, color: '#EAB308' };
	}
	if (s.defaultStatus === WISHLIST) s.defaultStatus = 'Not started';
	if (s.savedFilterPreset) {
		s.savedFilterPreset = {
			...s.savedFilterPreset,
			statusExclude: s.savedFilterPreset.statusExclude.filter((n) => n !== WISHLIST),
		};
	}
}

function normalizeGamesSettings(raw: unknown): GamesSettings {
	const defaults = defaultGamesSettings();
	const stored = readRecord(raw);
	const settings = readGamesSettings({ ...stored, platforms: platformTags(stored.platforms, defaults.platforms) }, defaults);
	retireWishlist(settings);
	return settings;
}

/** A game with the retired Wishlist status as a flag and the old text playtime in minutes; undefined without an id and a title. */
function normalizeGame(src: unknown, unwished: string): Game | undefined {
	const g = readGame(src);
	if (!g) return undefined;
	if (typeof at(src, 'status') !== 'string') g.status = unwished;
	const playtime = at(src, 'playtime');
	if (typeof at(src, 'playtimeMinutes') !== 'number' && typeof playtime === 'string') {
		g.playtimeMinutes = parsePlaytimeInput(playtime);
	}
	if (g.status === WISHLIST) {
		g.wishlist = true;
		g.status = unwished;
	}
	return g;
}

/** Applies GameDataManager's former load-time migration: platform strings, the retired Wishlist status, playtime. */
export function normalizeGames(raw: unknown, skipped: string[] = []): GamesData {
	const settings = normalizeGamesSettings(at(raw, 'settings'));
	const unwished = settings.defaultStatus || 'Not started';
	return {
		games: readEntries(at(raw, 'games'), (g) => normalizeGame(g, unwished), 'game', skipped),
		groups: readList(at(raw, 'groups'), readGameGroup),
		settings,
	};
}
