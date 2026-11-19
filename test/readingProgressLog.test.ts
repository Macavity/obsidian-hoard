import { describe, expect, it } from 'vitest';
import { progressLogLines, type ProgressCounts } from '../src/modules/reading/domain/progressLog';
import { formatCount } from '../src/shared/domain/format';
import type { Book, Manga, ReadingItemRef } from '../src/modules/reading/domain/model';

const counts = (over: Partial<ProgressCounts> = {}): ProgressCounts => ({
	pagesRead: 0, wordsRead: 0, chaptersRead: 0, volumesRead: 0, ...over,
});
const book = (over: Partial<Book> = {}): ReadingItemRef => ({
	kind: 'book',
	entry: { id: 'b1', title: 'Dune', progressUnit: 'pages', totalPages: 0, totalWords: 0, totalChapters: 0, ...over } as Book,
});
const manga = (over: Partial<Manga> = {}): ReadingItemRef => ({
	kind: 'manga',
	entry: { id: 'm1', title: 'Berserk', totalChapters: 0, totalVolumes: 0, ...over } as Manga,
});

describe('progressLogLines', () => {
	it('logs the word position of a words-mode book', () => {
		const ref = book({ progressUnit: 'words', totalWords: 1000, totalPages: 300 });
		expect(progressLogLines(ref, counts({ wordsRead: 500, pagesRead: 9 }), counts())).toEqual([
			`Dune (Book) At word ${formatCount(500)} / ${formatCount(1000)}`,
		]);
	});

	it('logs page then chapter for a pages-mode book', () => {
		const ref = book({ totalPages: 300, totalChapters: 12 });
		expect(progressLogLines(ref, counts({ pagesRead: 20, chaptersRead: 2 }), counts({ pagesRead: 10, chaptersRead: 1 }))).toEqual([
			`Dune (Book) At page ${formatCount(20)} / ${formatCount(300)}`,
			'Dune (Book) At chapter 2 / 12',
		]);
	});

	it('skips the page line when the total is 0', () => {
		expect(progressLogLines(book(), counts({ pagesRead: 20 }), counts())).toEqual([]);
	});

	it('logs chapter and volume of a manga', () => {
		const ref = manga({ totalChapters: 40, totalVolumes: 5 });
		expect(progressLogLines(ref, counts({ chaptersRead: 3, volumesRead: 1 }), counts())).toEqual([
			'Berserk (Manga) At chapter 3 / 40',
			'Berserk (Manga) At volume 1 / 5',
		]);
	});

	it('returns nothing when no counter changed', () => {
		expect(progressLogLines(book({ totalPages: 9 }), counts({ pagesRead: 4 }), counts({ pagesRead: 4 }))).toEqual([]);
		expect(progressLogLines(manga({ totalChapters: 9 }), counts(), counts())).toEqual([]);
	});
});
