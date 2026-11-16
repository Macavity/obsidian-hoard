import { DEFAULT_SETTINGS, type TagDefinition } from '../../types';
import { readTag } from '../../settingsNormalize';
import { at, readList, readOptionalString, readRecord, readString } from '../../storage/read';
import type { ImportContext } from './schema1Types';

const DEFAULT_COLOR = '#888780';

/** A type needs a name; one without a color gets a neutral one. */
function readType(t: unknown): TagDefinition | undefined {
	const name = readOptionalString(at(t, 'name'));
	return name === undefined ? undefined : { ...readRecord(t), name, color: readString(at(t, 'color'), DEFAULT_COLOR) };
}

/**
 * Adds the source's Watchlist types that Hoard's base lacks (matched by name), so their notes are
 * indexed; Hoard's own types and their colors stay. A no-op without a base or without new types.
 */
export async function registerTypes(ctx: ImportContext, incoming: unknown): Promise<void> {
	if (!Array.isArray(incoming)) return;
	await ctx.shared.load();
	if (!ctx.shared.baseFile()) return;
	const stored = ctx.shared.get().settings.types;
	const current = Array.isArray(stored) ? readList(stored, readTag) : DEFAULT_SETTINGS.types;
	const known = new Set(current.map((t) => t.name));
	const missing = readList(incoming, readType).filter((t) => !known.has(t.name));
	if (missing.length > 0) await ctx.shared.update({ types: [...current, ...missing] });
}
