import type { Book, Manga } from './model';
import { bookProgressUnit } from './readingDefaults';
import { formatCount } from '../../../shared/domain/format';

export type ReadingItemRef = { kind: 'book'; entry: Book } | { kind: 'manga'; entry: Manga };

export interface ProgressCounts {
	pagesRead: number;
	wordsRead: number;
	chaptersRead: number;
	volumesRead: number;
}

function line(title: string, type: string, unit: string, read: string | number, total: string | number): string {
	return `${title} (${type}) At ${unit} ${read} / ${total}`;
}

function bookLines(book: Book, draft: ProgressCounts, snap: ProgressCounts): string[] {
	const lines: string[] = [];
	// only the unit the book is tracked in is worth a log line
	if (bookProgressUnit(book) === 'words') {
		if (draft.wordsRead !== snap.wordsRead && book.totalWords > 0) {
			lines.push(line(book.title, 'Book', 'word', formatCount(draft.wordsRead), formatCount(book.totalWords)));
		}
	} else if (draft.pagesRead !== snap.pagesRead && book.totalPages > 0) {
		lines.push(line(book.title, 'Book', 'page', formatCount(draft.pagesRead), formatCount(book.totalPages)));
	}
	if (draft.chaptersRead !== snap.chaptersRead && book.totalChapters > 0) {
		lines.push(line(book.title, 'Book', 'chapter', draft.chaptersRead, book.totalChapters));
	}
	return lines;
}

function mangaLines(manga: Manga, draft: ProgressCounts, snap: ProgressCounts): string[] {
	const lines: string[] = [];
	if (draft.chaptersRead !== snap.chaptersRead && manga.totalChapters > 0) {
		lines.push(line(manga.title, 'Manga', 'chapter', draft.chaptersRead, manga.totalChapters));
	}
	if (draft.volumesRead !== snap.volumesRead && manga.totalVolumes > 0) {
		lines.push(line(manga.title, 'Manga', 'volume', draft.volumesRead, manga.totalVolumes));
	}
	return lines;
}

/** The history lines for the counters that changed between `snap` and `draft`. */
export function progressLogLines(ref: ReadingItemRef, draft: ProgressCounts, snap: ProgressCounts): string[] {
	return ref.kind === 'book' ? bookLines(ref.entry, draft, snap) : mangaLines(ref.entry, draft, snap);
}
