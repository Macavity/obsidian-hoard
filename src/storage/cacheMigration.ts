import type { ApiCheckKind } from './storageTypes';
import { isRecord } from './sharedHelpers';

const NONE = 'none';
const isNoneList = (v: unknown): boolean => Array.isArray(v) && v.length === 1 && v[0] === NONE;

type Check = { at: string; result: 'notfound' };

/** Which cache field a legacy `'none'` marker stood for, and the check that now records it. */
const MARKERS: { kind: ApiCheckKind; fields: string[]; isMarker: (v: unknown) => boolean }[] = [
	{ kind: 'trailer', fields: ['trailerUrl'], isMarker: (v) => v === NONE },
	{ kind: 'credits', fields: ['director', 'cast'], isMarker: isNoneList },
	{ kind: 'studio', fields: ['studio'], isMarker: isNoneList },
];

function migrateEntry(entry: Record<string, unknown>, at: string): { entry: Record<string, unknown>; changed: boolean } {
	const checks: Record<string, unknown> = isRecord(entry.apiCheck) ? entry.apiCheck : {};
	const added: Record<string, Check> = {};
	const dropped = new Set<string>();
	const note = (kind: ApiCheckKind): void => {
		if (!(kind in checks)) added[kind] = { at, result: 'notfound' };
	};

	if ('posterUrl' in entry) {
		dropped.add('posterUrl');
		if (entry.posterUrl === NONE) note('poster');
	}
	for (const m of MARKERS) {
		for (const field of m.fields) {
			if (!m.isMarker(entry[field])) continue;
			dropped.add(field);
			note(m.kind);
		}
	}
	if (dropped.size === 0) return { entry, changed: false };

	const kept = Object.fromEntries(Object.entries(entry).filter(([k]) => !dropped.has(k)));
	const apiCheck = { ...checks, ...added };
	return { entry: Object.keys(apiCheck).length > 0 ? { ...kept, apiCheck } : kept, changed: true };
}

/**
 * Turns the `'none'` markers older versions kept in the cache into `apiCheck` entries (notfound, so the
 * 7-day retry applies). `posterUrl` is no cache field any more and goes either way. An existing check is
 * never overwritten. Returns new objects; the input stays untouched.
 */
export function migrateNoneMarkers(
	cache: Record<string, unknown>,
	at: string,
): { cache: Record<string, unknown>; changed: boolean } {
	let changed = false;
	const out: Record<string, unknown> = {};
	for (const [id, value] of Object.entries(cache)) {
		if (!isRecord(value)) {
			out[id] = value;
			continue;
		}
		const r = migrateEntry(value, at);
		changed ||= r.changed;
		out[id] = r.entry;
	}
	return { cache: changed ? out : cache, changed };
}
