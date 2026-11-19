import { defined } from '../../../shared/domain/sharedHelpers';
import type { Book } from '.';
import type { Manga } from '.';

const isoNow = (): string => new Date().toISOString();

export type NewBook = Pick<Book, 'id' | 'title'> & Partial<Book>;

export type NewManga = Pick<Manga, 'id' | 'title'> & Partial<Manga>;

/** What books and manga share. */
function readingDefaults(now: string) {
	return {
		author: '',
		status: 'Plan to Read' as const,
		rating: 0,
		chaptersRead: 0,
		totalChapters: 0,
		coverUrl: '',
		vaultPage: '',
		dateStarted: null,
		dateFinished: null,
		releaseDate: null,
		dateAdded: now,
		dateModified: now,
		customFields: {},
	};
}

export function newBook(fields: NewBook, now = isoNow()): Book {
	const { id, title, ...rest } = fields;
	return {
		id,
		title,
		...readingDefaults(now),
		progressUnit: 'pages',
		pagesRead: 0,
		totalPages: 0,
		wordsRead: 0,
		totalWords: 0,
		googleBooksId: '',
		openLibraryId: '',
		...defined(rest),
	};
}

export function newManga(fields: NewManga, now = isoNow()): Manga {
	const { id, title, ...rest } = fields;
	return {
		id,
		title,
		...readingDefaults(now),
		volumesRead: 0,
		totalVolumes: 0,
		malId: '',
		...defined(rest),
	};
}
