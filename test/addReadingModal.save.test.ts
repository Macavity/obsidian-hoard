import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddReadingModal, type ReadingFormState, type ReadingMode } from '../src/AddReadingModal';
import type { Book, Manga } from '../src/types';

const NOW = '2026-03-04T05:06:07.000Z';

const FORM: ReadingFormState = {
	title: '  Dune ', author: ' Herbert ', status: 'Reading', rating: 4.5, progressUnit: 'words',
	pagesRead: 10, totalPages: 500, wordsRead: 2500, totalWords: 125000, chaptersRead: 2, totalChapters: 40,
	volumesRead: 1, totalVolumes: 6, coverUrl: ' https://img.test/dune.jpg ', googleBooksId: ' gb1 ', openLibraryId: ' OL1W ',
	malId: ' 42 ', vaultPage: 'Notes/Dune.md', dateStarted: '2026-01-02', dateFinished: null, releaseDate: '1965-08-01',
};

const KEPT = {
	dateAdded: '2025-01-01T00:00:00.000Z', dateModified: '2025-02-02T00:00:00.000Z', customFields: { c1: 'x' },
	favorite: true, dateFavorited: '2025-03-03T00:00:00.000Z', groups: ['Sci-Fi'], externalLink: 'https://e.test',
	airtime: { recurrence: 'once' as const },
};

const OLD_BOOK: Book = {
	id: 'Books/Old', title: 'Old', author: 'Nobody', status: 'Plan to Read', rating: 0, progressUnit: 'pages',
	pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0, coverUrl: '',
	googleBooksId: '', openLibraryId: '', vaultPage: '', dateStarted: null, dateFinished: null, releaseDate: null, ...KEPT,
};

const OLD_MANGA: Manga = {
	id: 'Manga/Old', title: 'Old', author: 'Nobody', status: 'Plan to Read', rating: 0, chaptersRead: 0, totalChapters: 0,
	volumesRead: 0, totalVolumes: 0, coverUrl: '', malId: '', vaultPage: '', dateStarted: null, dateFinished: null,
	releaseDate: null, ...KEPT,
};

function setup(mode: ReadingMode, existingId?: string) {
	const calls: { op: string; item: unknown }[] = [];
	const record = (op: string) => (item: unknown) => { calls.push({ op, item: structuredClone(item) }); return Promise.resolve(); };
	const readingData = {
		getSettings: () => ({}),
		generateBookId: (title: string) => `Books/${title}`,
		generateMangaId: (title: string) => `Manga/${title}`,
		getBook: (id: string) => (id === OLD_BOOK.id ? OLD_BOOK : undefined),
		getManga: (id: string) => (id === OLD_MANGA.id ? OLD_MANGA : undefined),
		addBook: record('addBook'), addManga: record('addManga'), updateBook: record('updateBook'), updateManga: record('updateManga'),
	};
	const initial = existingId ? { id: existingId, state: FORM } : undefined;
	const modal = new AddReadingModal({} as never, {} as never, readingData as never, mode, () => {}, initial);
	const internals = modal as unknown as { state: ReadingFormState; save: () => Promise<void> };
	if (!existingId) internals.state = { ...FORM };
	return { calls, save: () => internals.save() };
}

const BOOK_FORM = {
	title: 'Dune', author: 'Herbert', status: 'Reading', rating: 4.5, progressUnit: 'words',
	pagesRead: 10, totalPages: 500, wordsRead: 2500, totalWords: 125000, chaptersRead: 2, totalChapters: 40,
	coverUrl: 'https://img.test/dune.jpg', googleBooksId: 'gb1', openLibraryId: 'OL1W', vaultPage: 'Notes/Dune.md',
	dateStarted: '2026-01-02', dateFinished: null, releaseDate: '1965-08-01',
};

const MANGA_FORM = {
	title: 'Dune', author: 'Herbert', status: 'Reading', rating: 4.5, chaptersRead: 2, totalChapters: 40,
	volumesRead: 1, totalVolumes: 6, coverUrl: 'https://img.test/dune.jpg', malId: '42', vaultPage: 'Notes/Dune.md',
	dateStarted: '2026-01-02', dateFinished: null, releaseDate: '1965-08-01',
};

beforeEach(() => {
	// without fake timers this mocks Date only
	vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); });

describe('AddReadingModal save', () => {
	it('adds the complete book', async () => {
		const { calls, save } = setup('book');
		await save();
		expect(calls).toStrictEqual([{
			op: 'addBook',
			item: { id: 'Books/Dune', ...BOOK_FORM, dateAdded: NOW, dateModified: NOW, customFields: {} },
		}]);
	});

	it('adds the complete manga', async () => {
		const { calls, save } = setup('manga');
		await save();
		expect(calls).toStrictEqual([{
			op: 'addManga',
			item: { id: 'Manga/Dune', ...MANGA_FORM, dateAdded: NOW, dateModified: NOW, customFields: {} },
		}]);
	});

	it('saving an existing book keeps its id, dates, custom fields, favorite, groups, link and airtime', async () => {
		const { calls, save } = setup('book', OLD_BOOK.id);
		await save();
		expect(calls).toStrictEqual([{ op: 'updateBook', item: { id: 'Books/Old', ...BOOK_FORM, ...KEPT } }]);
	});

	it('saving an existing manga keeps its id, dates, custom fields, favorite, groups, link and airtime', async () => {
		const { calls, save } = setup('manga', OLD_MANGA.id);
		await save();
		expect(calls).toStrictEqual([{ op: 'updateManga', item: { id: 'Manga/Old', ...MANGA_FORM, ...KEPT } }]);
	});
});
