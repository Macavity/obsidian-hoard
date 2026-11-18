// FakeApp + storage stores + ReadingDataManager wired like main.ts (root 'W', base file present).
import { createStores, newReadingManager } from './common';
import type { Book, Manga } from '../../src/shared/domain/types';

/** Reading without an Upcoming tracker behind it. */
const noUpcoming = { autoAddReadingToUpcoming: () => Promise.resolve(), removeReadingAirtimeEntries: () => Promise.resolve() };

export async function setupReadingDataManager(files: Record<string, string>) {
	const { f, local, shared, index, base, notices } = await createStores(files, { createBase: true });
	const rdm = newReadingManager(base, noUpcoming);
	await rdm.init();
	return { rdm, f, local, index, shared, notices };
}

export function makeBook(over: Partial<Book>): Book {
	const now = new Date().toISOString();
	return {
		id: 'tmp', title: 'Untitled', author: '', status: 'Plan to Read', rating: 0, progressUnit: 'pages',
		pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0,
		coverUrl: '', googleBooksId: '', openLibraryId: '', vaultPage: '', dateStarted: null, dateFinished: null,
		releaseDate: null, dateAdded: now, dateModified: now, customFields: {}, ...over,
	};
}

export function makeManga(over: Partial<Manga>): Manga {
	const now = new Date().toISOString();
	return {
		id: 'tmp', title: 'Untitled', author: '', status: 'Plan to Read', rating: 0, chaptersRead: 0,
		totalChapters: 0, volumesRead: 0, totalVolumes: 0, coverUrl: '', malId: '', vaultPage: '',
		dateStarted: null, dateFinished: null, releaseDate: null, dateAdded: now, dateModified: now,
		customFields: {}, ...over,
	};
}
