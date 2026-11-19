import type { DateFormatPref } from '../../modules/settings/exports';

// Date display / parsing. Storage is always ISO — date-only fields are `YYYY-MM-DD`,
// dateAdded/dateModified are ISO timestamps. Only rendering and typed input follow
// the `dateFormat` setting; every parse funnels back to `YYYY-MM-DD`.

/** readable mask per format — placeholders and error hints */
const DATE_MASKS: Record<DateFormatPref, string> = {
	european: 'DD/MM/YYYY',
	american: 'MM/DD/YYYY',
	iso: 'YYYY-MM-DD',
};

/** separator each format writes (input accepts / - . in any case) */
const DATE_SEPARATORS: Record<DateFormatPref, string> = {
	european: '/',
	american: '/',
	iso: '-',
};

/**
 * Active display format, mirrored from `settings.dateFormat` by setActiveDateFormat
 * (on load and on every save).
 *
 * A module-level mirror rather than a parameter on ~30 call sites: pure helpers like
 * formatDateDisplay and formatHistoryDate have no plugin instance. Every
 * function below still takes an explicit override for tests and one-off renders.
 */
let activeDateFormat: DateFormatPref = 'european';

export function setActiveDateFormat(fmt: DateFormatPref): void {
	activeDateFormat = fmt;
}

export function getActiveDateFormat(): DateFormatPref {
	return activeDateFormat;
}

/** The input mask for the active (or given) format, e.g. `DD/MM/YYYY`. */
export function dateFormatMask(fmt: DateFormatPref = activeDateFormat): string {
	return DATE_MASKS[fmt];
}

/**
 * A Date's *local* calendar day as `YYYY-MM-DD`. Always use this instead of
 * `date.toISOString().split('T')[0]`, which converts to UTC first and so returns the
 * wrong day for part of every local day.
 */
export function toIsoDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Today as `YYYY-MM-DD`, from the local calendar day. */
export function todayIso(): string {
	return toIsoDate(new Date());
}

/** Splits a stored `YYYY-MM-DD` into parts, or null when it isn't one. */
export function isoParts(dateStr: string): { y: string; m: string; d: string } | null {
	const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	return m ? { y: m[1]!, m: m[2]!, d: m[3]! } : null;
}

/**
 * Renders a stored `YYYY-MM-DD` in the active format. Empty → ''; anything that
 * isn't a plain ISO date passes through untouched (old release dates predate
 * strict validation).
 */
export function formatDateDisplay(
	dateStr: string | null | undefined,
	fmt: DateFormatPref = activeDateFormat,
): string {
	if (!dateStr) return '';
	const p = isoParts(dateStr);
	if (!p) return dateStr;
	const sep = DATE_SEPARATORS[fmt];
	if (fmt === 'iso') return `${p.y}${sep}${p.m}${sep}${p.d}`;
	if (fmt === 'american') return `${p.m}${sep}${p.d}${sep}${p.y}`;
	return `${p.d}${sep}${p.m}${sep}${p.y}`;
}

/** Two-digit-year variant for the compact widgets (`25/07/26`, `07/25/26`, `26-07-25`). */
export function formatShortDateDisplay(
	dateStr: string | null | undefined,
	fmt: DateFormatPref = activeDateFormat,
): string {
	if (!dateStr) return '';
	const p = isoParts(dateStr.slice(0, 10));
	if (!p) return dateStr;
	const yy = p.y.slice(2);
	const sep = DATE_SEPARATORS[fmt];
	if (fmt === 'iso') return `${yy}${sep}${p.m}${sep}${p.d}`;
	if (fmt === 'american') return `${p.m}${sep}${p.d}${sep}${yy}`;
	return `${p.d}${sep}${p.m}${sep}${yy}`;
}

/**
 * Parses typed input in the active format into `YYYY-MM-DD`, or null. Accepts / - .
 * and 1- or 2-digit day/month, but the *order* is fixed by the format, so
 * `03/04/2026` is never guessed at.
 */
export function parseDateInput(
	str: string,
	fmt: DateFormatPref = activeDateFormat,
): string | null {
	const trimmed = str.trim();
	if (!trimmed) return null;
	const parts = trimmed.split(/[/.-]/);
	if (parts.length !== 3) return null;
	let dd: string | undefined, mm: string | undefined, yyyy: string | undefined;
	if (fmt === 'iso') [yyyy, mm, dd] = parts;
	else if (fmt === 'american') [mm, dd, yyyy] = parts;
	else [dd, mm, yyyy] = parts;
	if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
	const d = parseInt(dd, 10), mo = parseInt(mm, 10), y = parseInt(yyyy, 10);
	if (isNaN(d) || isNaN(mo) || isNaN(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
	// reject impossible dates (Feb 31): the Date constructor rolls over, so verify the components
	const check = new Date(y, mo - 1, d);
	if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
	return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Lenient parse for release-date fields: the active format *or* raw ISO, which is what
 * the APIs return and what older stored values look like. The 4-digit group's position
 * disambiguates them.
 */
export function parseReleaseDateInput(
	str: string,
	fmt: DateFormatPref = activeDateFormat,
): string | null {
	const trimmed = str.trim();
	if (!trimmed) return null;
	// year-first always reads as ISO, whatever the display setting is
	if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(trimmed)) {
		return parseDateInput(trimmed, 'iso');
	}
	return parseDateInput(trimmed, fmt);
}

/**
 * True when a `YYYY-MM-DD` release date is strictly after today. Mirrors the auto
 * "To be released" check (see EditTitleModal).
 */
export function isReleaseDateFuture(releaseDate: string | null | undefined): boolean {
	if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return false;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const releaseMs = new Date(releaseDate + 'T12:00:00').getTime();
	return releaseMs > today.getTime();
}
