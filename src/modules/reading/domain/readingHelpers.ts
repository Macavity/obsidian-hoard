import type { Book } from '../contract';
import { bookProgressUnit } from '../../../shared/domain/reading';

/**
 * Reading Rows sections. No groups and no type registry, so "By status" is the only
 * grouped grid; with it off the flat fallback shows.
 */
export const READING_ROWS_SHELVES: ReadonlyArray<{ id: string }> = [
	{ id: 'favorites' },
	{ id: 'recentlyAdded' },
	{ id: 'recentlyRead' },
	{ id: 'recentlyReleased' },
	{ id: 'byStatus' },
];

/**
 * The read/total pair the book's own unit tracks, plus its label. Every progress
 * readout goes through this, so the unit is honoured in one place.
 */
export function bookUnitProgress(book: Book): { read: number; total: number; label: string } {
	return bookProgressUnit(book) === 'words'
		? { read: book.wordsRead ?? 0, total: book.totalWords ?? 0, label: 'words' }
		: { read: book.pagesRead ?? 0, total: book.totalPages ?? 0, label: 'pages' };
}
