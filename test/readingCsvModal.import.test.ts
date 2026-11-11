import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingCsvModal } from '../src/ReadingCsvModal';
import type { Book, Manga } from '../src/types';
import type { ReadingCsvKind } from '../src/ReadingCsvChoiceModal';
import { clickByText, clickNext, shownNotices, uploadCsv, valueSelect } from './helpers/csvWizard';

function setup(kind: ReadingCsvKind, defaultStatus?: string) {
	const books: Book[][] = [];
	const manga: Manga[][] = [];
	const notifyChange = vi.fn();
	const readingDataManager = {
		getBooks: () => [],
		getMangaList: () => [],
		getSettings: () => ({ defaultStatus }),
		generateBookId: (n: string) => `book-${n}`,
		generateMangaId: (n: string) => `manga-${n}`,
		addBookBatch: (c: Book[]) => { books.push(c); return Promise.resolve(); },
		addMangaBatch: (c: Manga[]) => { manga.push(c); return Promise.resolve(); },
		notifyChange,
	};
	const modal = new ReadingCsvModal({} as never, { readingDataManager } as never, kind, 'import');
	return { modal, books, manga, notifyChange };
}

async function importCsv(modal: ReadingCsvModal, csv: string): Promise<void> {
	await uploadCsv(modal, csv);
	clickNext(modal);
	clickByText(modal.contentEl, 'button', 'Import selected');
}

beforeEach(() => { shownNotices.length = 0; });

describe('ReadingCsvModal book import', () => {
	it('fills book defaults for a title-only row', async () => {
		const { modal, books, notifyChange } = setup('book', 'Reading');
		await importCsv(modal, 'Title\n  Dune ');
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]).toMatchObject({
			id: 'book-Dune', title: 'Dune', author: '', status: 'Reading', rating: 0, progressUnit: 'pages',
			pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0,
			googleBooksId: '', externalLink: '', dateStarted: null, dateFinished: null, releaseDate: null,
		});
		await vi.waitFor(() => expect(notifyChange).toHaveBeenCalled());
	});

	it('falls back to Plan to Read without a configured default status', async () => {
		const { modal, books } = setup('book');
		await importCsv(modal, 'Title\nDune');
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]!.status).toBe('Plan to Read');
	});

	it('imports every mapped book column', async () => {
		const { modal, books } = setup('book');
		await importCsv(modal, [
			'Title,Author,Status,Rating,Pages Read,Total Pages,Words Read,Total Words,Chapters Read,Total Chapters,Started,Finished,Release Date,Link,Google Books ID',
			'Dune,Herbert,Completed,4.5,10,500,0,0,2,40,2024-01-02,2024-02-03,1965-08-01,https://x.test,gb1',
		].join('\n'));
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]).toMatchObject({
			title: 'Dune', author: 'Herbert', status: 'Completed', rating: 4.5, pagesRead: 10, totalPages: 500,
			chaptersRead: 2, totalChapters: 40, externalLink: 'https://x.test', googleBooksId: 'gb1',
			dateStarted: '2024-01-02', dateFinished: '2024-02-03', releaseDate: '1965-08-01',
		});
	});

	it('imports an Open Library ID column next to the Google Books ID', async () => {
		const { modal, books } = setup('book');
		await importCsv(modal, 'Title,Google Books ID,Open Library ID\nDune,gb1,OL1W');
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]).toMatchObject({ googleBooksId: 'gb1', openLibraryId: 'OL1W' });
	});

	it.each([
		['an explicit words unit', 'Title,Progress Unit,Total Pages\nA,words,100', 'words'],
		['an explicit pages unit despite word counts', 'Title,Progress Unit,Total Words\nA,pages,100', 'pages'],
		['total words only', 'Title,Total Words\nA,100', 'words'],
		['words read only', 'Title,Words Read\nA,5', 'words'],
		['an unknown unit and no word counts', 'Title,Progress Unit,Total Pages\nA,chapters,10', 'pages'],
	])('derives the progress unit from %s', async (_name, csv, unit) => {
		const { modal, books } = setup('book');
		await importCsv(modal, csv);
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]!.progressUnit).toBe(unit);
	});

	it('maps an unknown status through the value step', async () => {
		const { modal, books } = setup('book');
		await uploadCsv(modal, 'Title,Status\nDune,reading');
		clickNext(modal);
		valueSelect(modal, 0).value = 'Completed';
		clickByText(modal.contentEl, 'button', 'Preview →');
		clickByText(modal.contentEl, 'button', 'Import selected');
		await vi.waitFor(() => expect(books).toHaveLength(1));
		expect(books[0]![0]!.status).toBe('Completed');
	});
});

describe('ReadingCsvModal manga import', () => {
	it('imports a manga row with its volume and chapter counts', async () => {
		const { modal, manga, books } = setup('manga', 'Reading');
		await importCsv(modal, 'Title,Author,Chapters Read,Total Chapters,Volumes Read,Total Volumes,MAL ID\nAkira,Otomo,3,120,1,6,42');
		await vi.waitFor(() => expect(manga).toHaveLength(1));
		expect(books).toHaveLength(0);
		expect(manga[0]![0]).toMatchObject({
			id: 'manga-Akira', title: 'Akira', author: 'Otomo', status: 'Reading', rating: 0,
			chaptersRead: 3, totalChapters: 120, volumesRead: 1, totalVolumes: 6, malId: '42',
			externalLink: '', dateStarted: null, dateFinished: null, releaseDate: null,
		});
	});

	it('uses defaults for a title-only manga row', async () => {
		const { modal, manga } = setup('manga');
		await importCsv(modal, 'Title\nAkira');
		await vi.waitFor(() => expect(manga).toHaveLength(1));
		expect(manga[0]![0]).toMatchObject({
			status: 'Plan to Read', author: '', chaptersRead: 0, totalChapters: 0, volumesRead: 0, totalVolumes: 0, malId: '',
		});
	});

	it('keeps explicit dates and an explicit status', async () => {
		const { modal, manga } = setup('manga');
		await importCsv(modal, 'Title,Status,Rating,Link,Started,Finished,Release Date\nAkira,Completed,5,https://m.test,2024-01-02,2024-02-03,1988-12-06');
		await vi.waitFor(() => expect(manga).toHaveLength(1));
		expect(manga[0]![0]).toMatchObject({
			status: 'Completed', rating: 5, externalLink: 'https://m.test',
			dateStarted: '2024-01-02', dateFinished: '2024-02-03', releaseDate: '1988-12-06',
		});
	});
});
