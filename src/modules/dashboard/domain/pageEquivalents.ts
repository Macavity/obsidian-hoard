import type { Book } from '../../reading/exports';
import { bookProgressUnit } from '../../reading/exports';

/**
 * Words per page, used *only* to fold words-mode books into a pages aggregate (the
 * Dashboard Books ring). No stored value is ever converted.
 */
const WORDS_PER_PAGE = 250;

/** Page-equivalent read/total, so words-mode books can join a pages aggregate. */
export function bookPageEquivalents(book: Book): { read: number; total: number } {
	if (bookProgressUnit(book) === 'words') {
		return {
			read: Math.round((book.wordsRead ?? 0) / WORDS_PER_PAGE),
			total: Math.round((book.totalWords ?? 0) / WORDS_PER_PAGE),
		};
	}
	return { read: book.pagesRead ?? 0, total: book.totalPages ?? 0 };
}
