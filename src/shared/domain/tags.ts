import { at, readRecord } from './read';

export interface TagDefinition {
	name: string;
	color: string;
}

/**
 * One tier of the 5-level rating system. Index 0 = 1★ … 4 = 5★; a whole star shares
 * its tier with the half-step below (0.5 & 1 = tier 1 …). Rating 0 = unrated.
 */
export interface RatingTier {
	label: string;
	color: string;
}

// Custom Lists types

export interface FieldColorEntry {
	color600: string;
	color50: string;
}

export const FIELD_COLORS: FieldColorEntry[] = [
	{ color600: '#534AB7', color50: '#EEEDFE' },
	{ color600: '#1D9E75', color50: '#E1F5EE' },
	{ color600: '#EF9F27', color50: '#FAEEDA' },
	{ color600: '#378ADD', color50: '#E6F1FB' },
	{ color600: '#D85A30', color50: '#FAECE7' },
	{ color600: '#993556', color50: '#FBEAF0' },
	{ color600: '#639922', color50: '#EAF3DE' },
	{ color600: '#5F5E5A', color50: '#F1EFE8' },
];

export const DEFAULT_FIELD_COLOR = '#5F5E5A';

/**
 * Badge color for a type/status/priority. Themes never override these; the theme
 * parameter is accepted for API compatibility and intentionally unused.
 */
export function getThemedColor(name: string, defaultColor: string, theme: string): string {
	return defaultColor;
}

// Priority filtering. '' is a real, tickable filter option — not a gap.

/** Filter option value for "no priority set". */
const NO_PRIORITY = '';

/** Priority filter options: the configured names plus the empty one. */
export function priorityFilterOpts(priorities: readonly TagDefinition[]): string[] {
	return [...priorities.map((p) => p.name), NO_PRIORITY];
}

/**
 * Saved `priorityEmptyOnly` → exclude set. The old exclusive toggle meant "empty only",
 * which is now the same as excluding every named priority.
 */
export function migratePriorityExclude(
	exclude: readonly string[] | undefined,
	emptyOnly: boolean | undefined,
	priorities: readonly TagDefinition[],
): Set<string> {
	if (emptyOnly) return new Set(priorities.map((p) => p.name));
	return new Set(exclude ?? []);
}

/** True when the live exclude set holds exactly the saved values (order ignored). */
export function setsMatch(live: ReadonlySet<string>, saved: readonly string[]): boolean {
	return live.size === saved.length && saved.every((x) => live.has(x));
}

/** Whether the live priority exclude set equals a saved preset's (migrating the legacy empty-only toggle). */
export function priorityExcludeMatches(
	live: ReadonlySet<string>,
	preset: { priorityExclude?: readonly string[]; priorityEmptyOnly?: boolean },
	priorities: readonly TagDefinition[],
): boolean {
	return setsMatch(live, Array.from(migratePriorityExclude(preset.priorityExclude, preset.priorityEmptyOnly, priorities)));
}

/** A name with a colour; any other key of the entry stays. */
export function readTag(item: unknown): TagDefinition | undefined {
	const name = at(item, 'name');
	const color = at(item, 'color');
	return typeof name === 'string' && typeof color === 'string' ? { ...readRecord(item), name, color } : undefined;
}
