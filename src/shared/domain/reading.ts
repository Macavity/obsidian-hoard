import type { Book, BookProgressUnit, ReadingSettings, ReadingStatus } from '../../modules/reading/contract';
import type { HoardPluginSettings } from '../../modules/settings/contract';
import { DEFAULT_SETTINGS } from './settingsDefaults';

export const READING_STATUSES: ReadingStatus[] = [
	'Reading',
	'Completed',
	'Plan to Read',
	'To be released',
	'Dropped',
];

/**
 * Statuses pickable by hand. "To be released" is auto-managed from the release date
 * (mirroring the watchlist), so it is excluded from every dropdown.
 */
export const SELECTABLE_READING_STATUSES: ReadingStatus[] = READING_STATUSES.filter(
	(s) => s !== 'To be released',
);

/** the book's unit, tolerating records written before the field existed */
export function bookProgressUnit(book: Book): BookProgressUnit {
	return book.progressUnit === 'words' ? 'words' : 'pages';
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
	defaultFolder: 'Hoard/Reading',
	defaultStatus: 'Plan to Read',
	bookCustomFieldStyle: 'fill',
	mangaCustomFieldStyle: 'fill',
};

// Games types

/** Fallback colors for the five fixed reading statuses (names are not editable). */
export const DEFAULT_READING_STATUS_COLORS: Record<ReadingStatus, string> = {
	'Reading': '#1D9E75',
	'Completed': '#7F77DD',
	'Plan to Read': '#E8873A',
	'To be released': '#3A86C8',
	'Dropped': '#E24B4A',
};

// Airtime types

/** Badge color for a Reading type (Book / Manga), from settings.readingTypeColors. */
export function getReadingTypeColor(
	kind: 'book' | 'manga',
	settings: Pick<HoardPluginSettings, 'readingTypeColors'>,
): string {
	const colors = settings.readingTypeColors ?? DEFAULT_SETTINGS.readingTypeColors;
	return kind === 'manga' ? colors.manga : colors.book;
}

// Shared utility

// Date display / parsing. Storage is always ISO — date-only fields are `YYYY-MM-DD`,
// dateAdded/dateModified are ISO timestamps. Only rendering and typed input follow
// the `dateFormat` setting; every parse funnels back to `YYYY-MM-DD`.
