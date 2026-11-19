/** one horizontal shelf in the Rows layout */
export interface RowsShelfLayoutEntry {
	id: string;
	enabled: boolean;
}

/**
 * The Rows-view sections in default order. All shelves except `byType` / `byStatus`,
 * the virtualised grids — those reorder and toggle like any shelf.
 */
export const ROWS_SHELVES: ReadonlyArray<{ id: string }> = [
	{ id: 'favorites' },
	{ id: 'recommended' },
	{ id: 'recentlyAdded' },
	{ id: 'recentlyWatched' },
	{ id: 'groups' },
	{ id: 'recentlyReleased' },
	{ id: 'byType' },
	{ id: 'byStatus' },
];

/**
 * Shelf ids that can never both be on — byType and byStatus group the same library,
 * so both would show every title twice. Decided by shelvesExclude, which normalizeRowsLayout
 * and RowsCustomizeModal both use. All members off ⇒ one flat ungrouped grid.
 */
export const ROWS_EXCLUSIVE_SHELVES: ReadonlyArray<ReadonlyArray<string>> = [
	['byType', 'byStatus'],
];

/**
 * Favorites-shelf order: newest favorite first. Sorts in place, stable — items with no
 * stamp (favorited before the field existed) sink to the end keeping their incoming order.
 */
export function sortByFavorited<T extends { dateFavorited?: string }>(items: T[]): T[] {
	return items.sort((a, b) => {
		const av = a.dateFavorited ?? '';
		const bv = b.dateFavorited ?? '';
		if (av === bv) return 0;
		if (!av) return 1;
		if (!bv) return -1;
		return bv.localeCompare(av);
	});
}

/** True when the two shelf ids are different members of one exclusive group. */
export function shelvesExclude(a: string, b: string, groups: ReadonlyArray<ReadonlyArray<string>>): boolean {
	return a !== b && groups.some((group) => group.includes(a) && group.includes(b));
}

/** Something stored that names a shelf. Only the id is checked; `enabled` is read as "not false". */
const isShelfEntry = (v: unknown): v is { id: string; enabled?: unknown } =>
	typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string';

/** The stored entries that name a registered shelf, the first occurrence of each; on unless stored as `false`. */
function storedShelves(stored: unknown, shelves: ReadonlyArray<{ id: string }>): RowsShelfLayoutEntry[] {
	const entries: unknown[] = Array.isArray(stored) ? stored : [];
	return entries
		.filter(isShelfEntry)
		.filter((entry) => shelves.some((shelf) => shelf.id === entry.id))
		.filter((entry, i, all) => all.findIndex((other) => other.id === entry.id) === i)
		.map((entry) => ({ id: entry.id, enabled: entry.enabled !== false }));
}

/**
 * The layout with every registered shelf it lacks appended in registry order. A shelf is appended
 * off when the layout built so far holds one that excludes it (byStatus next to a stored byType),
 * so an update never pops a second grouping on by itself.
 */
function withMissingShelves(
	layout: RowsShelfLayoutEntry[],
	shelves: ReadonlyArray<{ id: string }>,
	groups: ReadonlyArray<ReadonlyArray<string>>,
): RowsShelfLayoutEntry[] {
	return shelves.reduce((built, shelf) => {
		if (built.some((entry) => entry.id === shelf.id)) return built;
		const excluded = built.some((entry) => shelvesExclude(entry.id, shelf.id, groups));
		return [...built, { id: shelf.id, enabled: !excluded }];
	}, layout);
}

/** Self-heal: an entry is switched off when an earlier one that stays on excludes it, so a hand-edited data.json can't show both. */
function oneEnabledPerGroup(
	layout: RowsShelfLayoutEntry[],
	groups: ReadonlyArray<ReadonlyArray<string>>,
): RowsShelfLayoutEntry[] {
	return layout.reduce<RowsShelfLayoutEntry[]>((kept, entry) => {
		const beaten = kept.some((earlier) => earlier.enabled && shelvesExclude(earlier.id, entry.id, groups));
		return [...kept, { id: entry.id, enabled: entry.enabled && !beaten }];
	}, []);
}

/**
 * A valid rows layout from whatever was stored: what is no shelf entry, unknown ids and duplicates
 * are dropped, registered shelves missing from the layout are appended. Always returns new objects.
 * `shelves` is the registry to validate against; `exclusiveGroups` lists ids that
 * can't both be on (first enabled in layout order wins).
 */
export function normalizeRowsLayout(
	stored: unknown,
	shelves: ReadonlyArray<{ id: string }> = ROWS_SHELVES,
	exclusiveGroups: ReadonlyArray<ReadonlyArray<string>> = ROWS_EXCLUSIVE_SHELVES,
): RowsShelfLayoutEntry[] {
	const complete = withMissingShelves(storedShelves(stored, shelves), shelves, exclusiveGroups);
	return oneEnabledPerGroup(complete, exclusiveGroups);
}

/**
 * Daily random picks for the Rows "Recommended" shelf; re-rolled when the stored
 * date is no longer today.
 */
export interface RecommendedDaily {
	date: string;   // YYYY-MM-DD the picks were rolled on ('' = never rolled)
	ids: string[];  // chosen title ids
}
