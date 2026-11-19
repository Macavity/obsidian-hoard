import type { EntryAirtime } from '../../airtime/exports';
import type { RowsShelfLayoutEntry } from '../../../shared/domain/rows';

export type ReadingStatus = 'Reading' | 'Completed' | 'Plan to Read' | 'To be released' | 'Dropped';

/**
 * Books track pages or words — some readers only know a word count. The unit is
 * per-book and both counter pairs are stored side by side, so switching never
 * destroys the other unit's numbers. Manga has no words analog.
 */
export type BookProgressUnit = 'pages' | 'words';

export interface Book {
	id: string;
	title: string;
	author: string;
	status: ReadingStatus;
	favorite?: boolean;
	dateFavorited?: string;
	rating: number;
	progressUnit: BookProgressUnit;
	pagesRead: number;
	totalPages: number;
	wordsRead: number;
	totalWords: number;
	chaptersRead: number;
	totalChapters: number;
	coverUrl: string;
	googleBooksId: string;
	/** Open Library work id (`OL…W`); stored only in External ID. */
	openLibraryId: string;
	externalLink?: string;
	vaultPage: string;
	dateStarted: string | null;
	dateFinished: string | null;
	releaseDate: string | null;
	dateAdded: string;
	dateModified: string;
	customFields: Record<string, string | number>;
	/** group names (frontmatter `groups`) */
	groups?: string[];
	/** manual Upcoming schedule (frontmatter airtime* keys); absent = none or derived from releaseDate */
	airtime?: EntryAirtime;
}

export interface Manga {
	id: string;
	title: string;
	author: string;
	status: ReadingStatus;
	favorite?: boolean;
	dateFavorited?: string;
	rating: number;
	chaptersRead: number;
	totalChapters: number;
	volumesRead: number;
	totalVolumes: number;
	coverUrl: string;
	malId: string;
	externalLink?: string;
	vaultPage: string;
	dateStarted: string | null;
	dateFinished: string | null;
	releaseDate: string | null;
	dateAdded: string;
	dateModified: string;
	customFields: Record<string, string | number>;
	/** group names (frontmatter `groups`) */
	groups?: string[];
	/** manual Upcoming schedule (frontmatter airtime* keys); absent = none or derived from releaseDate */
	airtime?: EntryAirtime;
}

export interface ReadingCustomColumn {
	id: string;
	name: string;
	type: 'text' | 'number' | 'select';
	options: string[];
	color?: string; // 600-stop hex; defaults to FIELD_COLORS gray
}

export interface ReadingSavedFilterPreset {
	name: string;
	statusInclude: ReadingStatus[];
	ratingMode: 'all' | 'has' | 'none';
}

export interface ReadingSettings {
	defaultFolder: string;
	defaultStatus: ReadingStatus;
	defaultSubTab?: 'books' | 'manga';
	bookCustomFieldStyle?: 'fill' | 'border';
	mangaCustomFieldStyle?: 'fill' | 'border';
	// one saved filter per sub-tab (Books / Manga keep their own)
	savedFilters?: Partial<Record<'books' | 'manga', ReadingSavedFilterPreset>>;
	/** Reading Rows section order + visibility, shared by the Books and Manga sub-tabs. */
	rowsLayout?: RowsShelfLayoutEntry[];
	/**
	 * Colors for the five fixed reading statuses, keyed by status name. Missing keys
	 * fall back to DEFAULT_READING_STATUS_COLORS.
	 */
	statusColors?: Record<string, string>;
}

export interface ReadingData {
	books: Book[];
	manga: Manga[];
	bookColumns: ReadingCustomColumn[];
	mangaColumns: ReadingCustomColumn[];
	settings: ReadingSettings;
}

export type ReadingKind = 'book' | 'manga';

export type ReadingItem = Book | Manga;

export type ReadingItemRef = { kind: 'book'; entry: Book } | { kind: 'manga'; entry: Manga };

// Roles other modules see instead of the concrete ReadingDataManager.





export type ReadingCsvKind = 'book' | 'manga';

export interface ReadingCsvOptions {
	kind: ReadingCsvKind;
	mode: 'export' | 'import';
}

export type OpenReadingCsv = (opts: ReadingCsvOptions) => void;