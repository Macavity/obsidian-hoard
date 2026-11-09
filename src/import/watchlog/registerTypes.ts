import { DEFAULT_SETTINGS, type TagDefinition } from '../../types';
import { isRecord, type ImportContext } from './schema1Types';

const isType = (t: unknown): t is TagDefinition => isRecord(t) && typeof t.name === 'string' && t.name !== '';

/**
 * Adds the source's Watchlist types that Hoard's base lacks (matched by name), so their notes are
 * indexed; Hoard's own types and their colors stay. A no-op without a base or without new types.
 */
export async function registerTypes(ctx: ImportContext, incoming: unknown): Promise<void> {
	if (!Array.isArray(incoming)) return;
	await ctx.shared.load();
	if (!ctx.shared.baseFile()) return;
	const current = (ctx.shared.get().settings.types as TagDefinition[] | undefined) ?? DEFAULT_SETTINGS.types;
	const known = new Set(current.map((t) => t.name));
	const missing = incoming.filter(isType).filter((t) => !known.has(t.name));
	if (missing.length > 0) await ctx.shared.update({ types: [...current, ...missing] });
}
