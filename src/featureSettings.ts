import { DEFAULT_READING_SETTINGS, DEFAULT_READING_STATUS_COLORS, READING_STATUSES } from './types';
import type {
	GamesSavedFilterPreset, GamesSettings, ReadingCustomColumn, ReadingSavedFilterPreset, ReadingSettings,
	RowsShelfLayoutEntry, TagDefinition,
} from './types';
import { readTag } from './settingsNormalize';
import { at, readList, readOneOf, readRecord, readString, readStringList } from './storage/read';
import { defined, isRecord } from './storage/sharedHelpers';

/** The `reading:` and `games:` settings blocks of the base and data.json, read field by field. */

const DEFAULT_COLUMN_COLOR = '#5F5E5A';
const COLUMN_TYPES = ['text', 'number', 'select'] as const;
const SUB_TABS = ['books', 'manga'] as const;
const FIELD_STYLES = ['fill', 'border'] as const;
const RATING_MODES = ['all', 'has', 'none'] as const;

/** Stored entries that name a shelf; which ones exist is for `normalizeRowsLayout` to decide. */
function readShelfEntry(item: unknown): RowsShelfLayoutEntry | undefined {
	const id = at(item, 'id');
	return typeof id === 'string' ? { id, enabled: at(item, 'enabled') !== false } : undefined;
}

const readShelves = (v: unknown): RowsShelfLayoutEntry[] | undefined =>
	Array.isArray(v) ? readList(v, readShelfEntry) : undefined;

/** The tags that are well-formed; the fallback when `v` is no list, or (unless `allowEmpty`) leaves none. */
function tagsOr(v: unknown, fallback: TagDefinition[], allowEmpty: boolean): TagDefinition[] {
	if (!Array.isArray(v)) return fallback;
	const tags = readList(v, readTag);
	return tags.length > 0 || allowEmpty ? tags : fallback;
}

const optionalFlag = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function readGamesPreset(v: unknown): GamesSavedFilterPreset | null | undefined {
	if (v === null) return null;
	if (!isRecord(v)) return undefined;
	return {
		genreExclude: readStringList(v.genreExclude),
		statusExclude: readStringList(v.statusExclude),
		ratingExclude: readStringList(v.ratingExclude),
		priorityExclude: readStringList(v.priorityExclude),
		platformExclude: readStringList(v.platformExclude),
		groupExclude: readStringList(v.groupExclude),
		...defined({
			ratingEmptyOnly: optionalFlag(v.ratingEmptyOnly),
			priorityEmptyOnly: optionalFlag(v.priorityEmptyOnly),
			recentlyArrivedOnly: optionalFlag(v.recentlyArrivedOnly),
			favoritesOnly: optionalFlag(v.favoritesOnly),
			wishlistOnly: optionalFlag(v.wishlistOnly),
			groupsOnly: optionalFlag(v.groupsOnly),
		}),
	};
}

/** Games settings from the merged device-local and shared records; `defaults` fills what is missing or unreadable. */
export function readGamesSettings(stored: Record<string, unknown>, defaults: GamesSettings): GamesSettings {
	return {
		...defaults,
		defaultStatus: readString(stored.defaultStatus, defaults.defaultStatus),
		statuses: tagsOr(stored.statuses, defaults.statuses, false),
		types: tagsOr(stored.types, defaults.types, false),
		platforms: tagsOr(stored.platforms, defaults.platforms, true),
		...defined({ rowsLayout: readShelves(stored.rowsLayout), savedFilterPreset: readGamesPreset(stored.savedFilterPreset) }),
	};
}

function readReadingPreset(v: unknown): ReadingSavedFilterPreset | undefined {
	const name = at(v, 'name');
	if (typeof name !== 'string') return undefined;
	const include = readList(at(v, 'statusInclude'), (s) => READING_STATUSES.find((status) => status === s));
	return { name, statusInclude: include, ratingMode: readOneOf(at(v, 'ratingMode'), RATING_MODES, 'all') };
}

function readSavedFilters(v: unknown): ReadingSettings['savedFilters'] {
	if (!isRecord(v)) return undefined;
	return defined({ books: readReadingPreset(v.books), manga: readReadingPreset(v.manga) });
}

/** Reading settings from the merged device-local and shared records, with the shipped defaults under them. */
export function readReadingSettings(stored: Record<string, unknown>): ReadingSettings {
	const defaults = DEFAULT_READING_SETTINGS;
	// "On Hold" was removed: it, like any other unknown status, falls back to the default
	const colors: Record<string, string> = { ...DEFAULT_READING_STATUS_COLORS };
	for (const [status, color] of Object.entries(readRecord(stored.statusColors))) {
		if (typeof color === 'string') colors[status] = color;
	}
	return {
		defaultFolder: readString(stored.defaultFolder, defaults.defaultFolder),
		defaultStatus: readOneOf(stored.defaultStatus, READING_STATUSES, defaults.defaultStatus),
		bookCustomFieldStyle: readOneOf(stored.bookCustomFieldStyle, FIELD_STYLES, 'fill'),
		mangaCustomFieldStyle: readOneOf(stored.mangaCustomFieldStyle, FIELD_STYLES, 'fill'),
		statusColors: colors,
		...defined({
			defaultSubTab: SUB_TABS.find((tab) => tab === stored.defaultSubTab),
			savedFilters: readSavedFilters(stored.savedFilters),
			rowsLayout: readShelves(stored.rowsLayout),
		}),
	};
}

function readColumn(item: unknown): ReadingCustomColumn | undefined {
	const id = at(item, 'id');
	const name = at(item, 'name');
	if (typeof id !== 'string' || typeof name !== 'string') return undefined;
	return {
		id,
		name,
		type: readOneOf(at(item, 'type'), COLUMN_TYPES, 'text'),
		options: readStringList(at(item, 'options')),
		color: readString(at(item, 'color')) || DEFAULT_COLUMN_COLOR,
	};
}

/** The custom columns of a reading sub-tab; what is no column is dropped. */
export const readColumns = (v: unknown): ReadingCustomColumn[] => readList(v, readColumn);
