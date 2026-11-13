import { DEFAULT_SETTINGS, normalizeRowsLayout } from './types';
import type { HoardPluginSettings, RatingTier, TagDefinition } from './types';
import { isRecord } from './storage/sharedHelpers';

/** Settings that no longer exist; dropped from stored data. */
export const REMOVED_SETTINGS = ['rootFolder', 'customListsFolder'];

/** Turns one stored value into a valid one. `fallback` is a fresh copy of the key's default. */
type Normalize<T> = (stored: unknown, fallback: T) => T;

/** Whether the value is of the sample's kind: both lists, both records, or of one primitive type. */
function sameKind(value: unknown, sample: unknown): boolean {
	if (Array.isArray(sample)) return Array.isArray(value);
	if (isRecord(sample)) return isRecord(value);
	return typeof value === typeof sample;
}

/**
 * The rule of every key that has none of its own: a stored value of the default's kind is kept.
 * Only the kind is checked. An unknown theme name or a list of the wrong things passes, as it
 * always did; a missing value, null, or text where a list belongs gives the default.
 */
function keepSameKind<T>(stored: unknown, fallback: T): T {
	return sameKind(stored, fallback) ? (stored as T) : fallback;
}

const oneOf = <T extends string>(...allowed: T[]): Normalize<T> =>
	(stored, fallback) => allowed.find((value) => value === stored) ?? fallback;

/** A list with at least one entry. What the entries are is not checked. */
function nonEmptyList<T>(stored: unknown, fallback: T[]): T[] {
	return Array.isArray(stored) && stored.length > 0 ? (stored as T[]) : fallback;
}

/** A stored record, spread over the default: keys it lacks keep their default. */
function mergedOver<T extends object>(stored: unknown, fallback: T): T {
	return isRecord(stored) ? { ...fallback, ...stored } : fallback;
}

const isTier = (v: unknown): v is RatingTier =>
	isRecord(v) && typeof v.label === 'string' && typeof v.color === 'string';

/** The rating system is always exactly five well-formed tiers; older or hand-edited data resets. */
const fiveTiers: Normalize<RatingTier[]> = (stored, fallback) =>
	Array.isArray(stored) && stored.length === 5 && stored.every(isTier) ? stored : fallback;

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
	withReleased(retinted(nonEmptyList(stored, fallback)));

/**
 * The keys whose stored value needs more than the right kind. A key not listed here follows
 * `keepSameKind`; a new setting needs an entry only when what it says can be wrong.
 */
const RULES: { [K in keyof HoardPluginSettings]?: Normalize<HoardPluginSettings[K]> } = {
	// existing installs saw DD/MM/YYYY everywhere, so the default is also where a hand-edited value lands
	dateFormat: oneOf('european', 'american', 'iso'),
	// the removed 'cards' view becomes the default, 'rows'
	defaultWatchlistView: oneOf('list', 'rows'),
	types: nonEmptyList,
	statuses: watchStatuses,
	reviews: nonEmptyList,
	priorities: nonEmptyList,
	seasonPalette: nonEmptyList,
	ratingSystem: fiveTiers,
	listFilters: mergedOver,
	cardTextStyles: mergedOver,
	readingTypeColors: readingColors,
	// the fallback is not passed on: the second parameter there is the shelf registry
	rowsLayout: (stored) => normalizeRowsLayout(stored),
};

/** A copy of the object with each value replaced, key by key, by one of the same type. */
function mapValues<T extends object>(source: T, each: <K extends keyof T>(value: T[K], key: K) => T[K]): T {
	const keys = Object.keys(source) as (keyof T)[];
	return Object.fromEntries(keys.map((key) => [key, each(source[key], key)])) as T;
}

/**
 * Valid settings from whatever was stored: every known key goes through its rule, with a fresh
 * copy of its default to fall back on, so the result shares nothing with DEFAULT_SETTINGS.
 * A key this version does not know passes through; a removed one is dropped.
 */
export function normalizeSettings(stored: Record<string, unknown>): HoardPluginSettings {
	const unknown = Object.fromEntries(Object.entries(stored).filter(([key]) => !REMOVED_SETTINGS.includes(key)));
	const known = mapValues(structuredClone(DEFAULT_SETTINGS), (fallback, key) => {
		const rule: Normalize<typeof fallback> = RULES[key] ?? keepSameKind;
		return rule(stored[key], fallback);
	});
	return { ...unknown, ...known };
}
