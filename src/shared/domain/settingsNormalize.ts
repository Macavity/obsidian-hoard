import { COLUMN_TYPES, DEFAULT_SETTINGS, normalizeRowsLayout } from './types';
import type { CustomListColumn, HoardPluginSettings, RatingTier, TagDefinition } from './types';
import { isRecord } from './sharedHelpers';
import { at, readList, readOneOf, readRecord } from './read';

/** Settings that no longer exist; dropped from stored data. */
export const REMOVED_SETTINGS = ['rootFolder', 'customListsFolder'];

/** Turns one stored value into a valid one. `fallback` is a fresh copy of the key's default. */
type Normalize<T> = (stored: unknown, fallback: T) => T;

/** Whether the value is of the sample's kind: both lists, both records, or of one primitive type. */
function sameKind<T>(value: unknown, sample: T): value is T {
	if (Array.isArray(sample)) return Array.isArray(value);
	if (isRecord(sample)) return isRecord(value);
	return typeof value === typeof sample;
}

/**
 * The rule of every key that has none of its own: a stored value of the default's kind is kept.
 * Only the kind is checked. An unknown theme name passes, as it always did; a missing value, null,
 * or text where a list belongs gives the default. Lists have their own rules (`listOf`).
 */
function keepSameKind<T>(stored: unknown, fallback: T): T {
	return sameKind(stored, fallback) ? stored : fallback;
}

const oneOf = <T extends string>(...allowed: T[]): Normalize<T> =>
	(stored, fallback) => allowed.find((value) => value === stored) ?? fallback;

/**
 * A list of what `readItem` accepts: entries it rejects are dropped. A list left without an entry
 * (or one that was never a list) gives the default, as every one of these lists needs at least one.
 */
const nonEmptyListOf = <T>(readItem: (item: unknown) => T | undefined): Normalize<T[]> => (stored, fallback) => {
	const items = readList(stored, readItem);
	return items.length > 0 ? items : fallback;
};

/** A list of what `readItem` accepts, possibly empty; a stored value that is no list gives the default. */
const listOf = <T>(readItem: (item: unknown) => T | undefined): Normalize<T[]> => (stored, fallback) =>
	Array.isArray(stored) ? readList(stored, readItem) : fallback;

/** A name with a colour; any other key of the entry stays. */
export function readTag(item: unknown): TagDefinition | undefined {
	const name = at(item, 'name');
	const color = at(item, 'color');
	return typeof name === 'string' && typeof color === 'string' ? { ...readRecord(item), name, color } : undefined;
}

function readTier(item: unknown): RatingTier | undefined {
	const label = at(item, 'label');
	const color = at(item, 'color');
	return typeof label === 'string' && typeof color === 'string' ? { ...readRecord(item), label, color } : undefined;
}

/** A column needs its id, label and type; its other keys (options, widths …) stay as stored. */
function readColumn(item: unknown): CustomListColumn | undefined {
	const id = at(item, 'id');
	const label = at(item, 'label');
	const type = readOneOf<(typeof COLUMN_TYPES)[number] | ''>(at(item, 'type'), COLUMN_TYPES, '');
	return typeof id === 'string' && typeof label === 'string' && type !== '' ? { ...readRecord(item), id, label, type } : undefined;
}

const readText = (item: unknown): string | undefined => (typeof item === 'string' ? item : undefined);

/** A stored record, spread over the default: keys it lacks keep their default. */
function mergedOver<T extends object>(stored: unknown, fallback: T): T {
	return isRecord(stored) ? { ...fallback, ...stored } : fallback;
}

/** The rating system is always exactly five well-formed tiers; older or hand-edited data resets. */
const fiveTiers: Normalize<RatingTier[]> = (stored, fallback) => {
	const tiers = readList(stored, readTier);
	return Array.isArray(stored) && stored.length === 5 && tiers.length === 5 ? tiers : fallback;
};

/** Each of the two badge colours is a non-empty text, else the default's. */
const readingColors: Normalize<HoardPluginSettings['readingTypeColors']> = (stored, fallback) => {
	if (!isRecord(stored)) return fallback;
	const colour = (value: unknown, or: string): string => (typeof value === 'string' && value ? value : or);
	return { ...stored, manga: colour(stored.manga, fallback.manga), book: colour(stored.book, fallback.book) };
};

/** "Plan to watch" moved from grey to teal; a colour the user picked stays. */
function retinted(statuses: TagDefinition[]): TagDefinition[] {
	const planToWatch = statuses.findIndex((s) => s.name === 'Plan to watch');
	return statuses.map((s, i) => (i === planToWatch && s.color === '#888780' ? { ...s, color: '#00A9A5' } : s));
}

/** Every install has "To be released": after "Completed", or last when that is gone. */
function withReleased(statuses: TagDefinition[]): TagDefinition[] {
	if (statuses.some((s) => s.name === 'To be released')) return statuses;
	const completed = statuses.findIndex((s) => s.name === 'Completed');
	const at = completed >= 0 ? completed + 1 : statuses.length;
	return [...statuses.slice(0, at), { name: 'To be released', color: '#E8873A' }, ...statuses.slice(at)];
}

const watchStatuses: Normalize<TagDefinition[]> = (stored, fallback) =>
	withReleased(retinted(nonEmptyListOf(readTag)(stored, fallback)));

/**
 * The keys whose stored value needs more than the right kind. A key not listed here follows
 * `keepSameKind`; a new setting needs an entry only when what it says can be wrong.
 */
const RULES: { [K in keyof HoardPluginSettings]?: Normalize<HoardPluginSettings[K]> } = {
	// existing installs saw DD/MM/YYYY everywhere, so the default is also where a hand-edited value lands
	dateFormat: oneOf('european', 'american', 'iso'),
	// the removed 'cards' view becomes the default, 'rows'
	defaultWatchlistView: oneOf('list', 'rows'),
	types: nonEmptyListOf(readTag),
	statuses: watchStatuses,
	reviews: nonEmptyListOf(readTag),
	priorities: nonEmptyListOf(readTag),
	seasonPalette: nonEmptyListOf(readText),
	customListTabOrder: listOf(readText),
	defaultCustomColumns: listOf(readColumn),
	ratingSystem: fiveTiers,
	listFilters: mergedOver,
	cardTextStyles: mergedOver,
	readingTypeColors: readingColors,
	// the fallback is not passed on: the second parameter there is the shelf registry
	rowsLayout: (stored) => normalizeRowsLayout(stored),
};

/** Whether the key is one of the settings this version has. */
const isSettingKey = (key: string): key is keyof HoardPluginSettings => Object.hasOwn(DEFAULT_SETTINGS, key);

/** Puts the checked value of one key into `out`, which starts as a copy of the defaults. */
function normalizeKey<K extends keyof HoardPluginSettings>(out: HoardPluginSettings, key: K, stored: unknown): void {
	const rule: Normalize<HoardPluginSettings[K]> = RULES[key] ?? keepSameKind;
	out[key] = rule(stored, out[key]);
}

/**
 * Valid settings from whatever was stored: every known key goes through its rule, with a fresh
 * copy of its default to fall back on, so the result shares nothing with DEFAULT_SETTINGS.
 * A key this version does not know passes through; a removed one is dropped.
 */
export function normalizeSettings(stored: Record<string, unknown>): HoardPluginSettings {
	const unknown = Object.fromEntries(Object.entries(stored).filter(([key]) => !REMOVED_SETTINGS.includes(key)));
	const out = structuredClone(DEFAULT_SETTINGS);
	for (const key of Object.keys(out)) {
		if (isSettingKey(key)) normalizeKey(out, key, stored[key]);
	}
	return { ...unknown, ...out };
}
