export const FOLDERS = { book: 'Books', manga: 'Manga', game: 'Games', customLists: 'CustomLists' } as const;

const UNSAFE = /[*"\\/<>:|?]/g;
/** Obsidian ignores dot-files; Windows refuses these device names. */
const LEADING_DOTS = /^\.+/;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const RESERVED_FOLDERS = new Set(Object.values(FOLDERS).map((f) => f.toLowerCase()));

/** A note or folder name that every OS and Obsidian accept; the plain `UNSAFE` form plus the above. */
export function safeFileName(name: string): string {
	const safe = name.replace(UNSAFE, '-').replace(LEADING_DOTS, (d) => '-'.repeat(d.length));
	return WINDOWS_RESERVED.test(safe) ? `${safe}-` : safe;
}

/** Type names double as folder names below the root, so they must be safe and must not collide with the fixed folders. */
export function safeTypeName(name: string): string {
	const safe = safeFileName(name.trim());
	return RESERVED_FOLDERS.has(safe.toLowerCase()) ? `${safe} (type)` : safe;
}

export type TypeNameProblem =
	| { reason: 'reserved'; name: string }
	| { reason: 'unsafe'; name: string; safe: string };

/** Why a type name cannot be used as entered, or null when it can. The UI layer renders the code. */
export function typeNameProblem(name: string): TypeNameProblem | null {
	const trimmed = name.trim();
	const safe = safeTypeName(name);
	if (safe === trimmed) return null;
	if (RESERVED_FOLDERS.has(trimmed.toLowerCase())) return { reason: 'reserved', name: trimmed };
	return { reason: 'unsafe', name: trimmed, safe };
}
