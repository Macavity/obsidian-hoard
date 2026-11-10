import { describe, it, expect } from 'vitest';
import { LibraryIndex, bookResultIdKeys, gameResultIdKeys } from '../src/LibraryIndex';
import type HoardPlugin from '../src/main';

const book = { title: 'H', author: '', year: 0, totalPages: 0, coverUrl: '', googleBooksId: '', openLibraryId: '', releaseDate: '', url: '' };

describe('result id keys', () => {
	it('keys an Open Library row', () => {
		expect(bookResultIdKeys({ ...book, openLibraryId: 'OL1W' })).toEqual(['openlibrary:OL1W']);
	});
	it('keys both ids when present', () => {
		expect(bookResultIdKeys({ ...book, googleBooksId: 'g', openLibraryId: 'OL1W' })).toEqual(['gbooks:g', 'openlibrary:OL1W']);
	});
	it('keys a Steam row like a synced game', () => {
		expect(gameResultIdKeys({ source: 'steam', id: 1145360, title: 'Hades', releaseDate: '', coverUrl: '', platforms: [], url: '' }))
			.toEqual(['steam:1145360']);
	});
});

describe('LibraryIndex', () => {
	it('matches a Steam row to a game with only steamAppId', () => {
		const plugin = { gameDataManager: { getGames: () => [{ title: 'Other', apiSource: '', apiId: '', steamAppId: '1145360' }] } } as unknown as HoardPlugin;
		const idx = LibraryIndex.build(plugin, ['games']);
		expect(idx.lookup(['steam:1145360'], 'Unrelated')).toBe('Games');
	});
	it('matches an Open Library row to a stored book', () => {
		const plugin = { readingDataManager: { getBooks: () => [{ title: 'Z', googleBooksId: '', openLibraryId: 'OL1W' }] } } as unknown as HoardPlugin;
		const idx = LibraryIndex.build(plugin, ['books']);
		expect(idx.lookup(['openlibrary:OL1W'], 'Unrelated')).toBe('Books');
	});
});
