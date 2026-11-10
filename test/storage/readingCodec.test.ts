import { describe, it, expect } from 'vitest';
import { decodeBook, decodeManga, encodeBook, encodeManga } from '../../src/storage/readingCodec';
import { ALL_PROPERTY_NAMES } from '../../src/storage/properties';
import type { Book, Manga, ReadingCustomColumn } from '../../src/types';

const COLS: ReadingCustomColumn[] = [
	{ id: 'col-1', name: 'Format', type: 'text', options: [] },
	{ id: 'col-2', name: 'Year', type: 'number', options: [] },
];

const base = { 'Date Added': '2026-01-01T00:00:00Z', 'Date Modified': '2026-01-01T00:00:00Z' };

const fullBook = (): Book => ({
	id: 'Books/Dune', title: 'Dune', author: 'Frank Herbert', status: 'Reading', favorite: true, dateFavorited: '2026-02-01T00:00:00Z',
	rating: 4, chaptersRead: 3, totalChapters: 40, progressUnit: 'words', pagesRead: 120, totalPages: 600, wordsRead: 5000,
	totalWords: 90000, googleBooksId: 'abc', openLibraryId: '', coverUrl: 'https://img.example/c.jpg', externalLink: 'https://books.example/dune',
	vaultPage: 'Books/Dune.md', dateStarted: '2026-01-02', dateFinished: null, releaseDate: '1965-08-01',
	dateAdded: '2026-01-01T00:00:00Z', dateModified: '2026-01-03T00:00:00Z', customFields: { 'col-1': 'Hardcover', 'col-2': 1965 },
	groups: ['SciFi'], airtime: { recurrence: 'weekly', day: 3, time: '09:00', season: 2, episode: 11, acknowledged: '2026-10-01' },
});

const fullManga = (): Manga => ({
	id: 'Manga/Berserk', title: 'Berserk', author: 'Miura', status: 'Reading', favorite: true, dateFavorited: '2026-02-01T00:00:00Z',
	rating: 5, chaptersRead: 10, totalChapters: 364, volumesRead: 1, totalVolumes: 41, malId: '2',
	coverUrl: 'https://img.example/b.jpg', externalLink: 'https://mal.example/2', vaultPage: 'Manga/Berserk.md',
	dateStarted: '2026-01-02', dateFinished: null, releaseDate: '1989-08-25', dateAdded: '2026-01-01T00:00:00Z',
	dateModified: '2026-01-03T00:00:00Z', customFields: {}, groups: ['Dark'],
	airtime: { recurrence: 'weekly', day: 3, time: '09:00', season: 2, episode: 11, acknowledged: '2026-10-01' },
});

const frozenKeys = (fm: Record<string, unknown>): string[] => Object.keys(fm).filter((k) => !k.startsWith('Custom '));

describe('reading codec', () => {
	it('writes only frozen property names for a book and reads them back', () => {
		const book = fullBook();
		const fm = encodeBook(book, COLS);
		for (const key of frozenKeys(fm)) expect(ALL_PROPERTY_NAMES).toContain(key);
		expect(fm).toMatchObject({
			Name: 'Dune', Author: 'Frank Herbert', 'Pages Read': 120, 'Progress Unit': 'words', 'Google Books ID': 'abc',
			'External ID': 'gbooks:abc', Cover: book.coverUrl, URL: book.externalLink, 'Date Added': book.dateAdded,
			'Airtime Episode': 11, 'Custom Format': 'Hardcover', Type: 'book',
		});
		expect(decodeBook(book.id, fm, COLS).entry).toEqual(book);
	});

	it('writes only frozen property names for a manga and reads them back, MAL ID as a number', () => {
		const manga = fullManga();
		const fm = encodeManga(manga, COLS);
		for (const key of frozenKeys(fm)) expect(ALL_PROPERTY_NAMES).toContain(key);
		expect(fm['MAL ID']).toBe(2);
		expect(fm).toMatchObject({ 'External ID': 'mal:manga:2', 'Volumes Read': 1, 'Total Volumes': 41, Type: 'manga', Favorite: true });
		expect(decodeManga(manga.id, fm, COLS).entry).toEqual(manga);
	});

	it('round-trips a book with custom fields', () => {
		const fm = { Name: 'Dune', Author: 'Frank Herbert', Status: 'Reading', Rating: 4, 'Pages Read': 120, 'Total Pages': 600,
			'Chapters Read': 0, 'Total Chapters': 0, 'Google Books ID': 'abc', 'Custom Format': 'Hardcover', 'Custom Year': 1965, ...base, Type: 'book' };
		const { entry, invalidFields } = decodeBook('Books/Dune', fm, COLS);
		expect(invalidFields).toEqual([]);
		expect(entry.id).toBe('Books/Dune');
		expect(entry.customFields).toEqual({ 'col-1': 'Hardcover', 'col-2': 1965 });
		expect(encodeBook(entry, COLS)).toMatchObject({ 'Custom Format': 'Hardcover', 'External ID': 'gbooks:abc', 'Pages Read': 120, 'Google Books ID': 'abc' });
	});

	it('maps External ID to the Google Books ID', () => {
		const { entry } = decodeBook('Books/X', { Name: 'X', Status: 'Reading', 'External ID': 'gbooks:zz', ...base }, []);
		expect(entry.googleBooksId).toBe('zz');
	});

	it('stores an Open Library id only as External ID', () => {
		const { entry } = decodeBook('Books/X', { Name: 'X', Status: 'Reading', 'External ID': 'openlibrary:OL1W', ...base }, []);
		expect(entry.openLibraryId).toBe('OL1W');
		expect(entry.googleBooksId).toBe('');
		const fm = encodeBook(entry, []);
		expect(fm['External ID']).toBe('openlibrary:OL1W');
		expect(fm).not.toHaveProperty('Google Books ID');
		expect(encodeBook({ ...entry, googleBooksId: 'g' }, [])['External ID']).toBe('gbooks:g');
	});

	it('round-trips manga with groups, airtime and favorite', () => {
		const fm = { Name: 'Berserk', Author: 'Miura', Status: 'Reading', Rating: 5, 'Chapters Read': 10, 'Total Chapters': 364,
			'Volumes Read': 1, 'Total Volumes': 41, 'MAL ID': 2, Groups: ['Dark'], Favorite: true, 'Date Favorited': '2026-02-01T00:00:00Z',
			'Airtime Recurrence': 'weekly', 'Airtime Day': 3, 'Airtime Time': '09:00', 'Airtime Season': 2, 'Airtime Episode': 11,
			'Airtime Acknowledged': '2026-10-01', ...base, Type: 'manga' };
		const { entry } = decodeManga('Manga/Berserk', fm, []);
		expect(entry.malId).toBe('2');
		expect(entry.groups).toEqual(['Dark']);
		expect(entry.airtime).toEqual({ recurrence: 'weekly', day: 3, time: '09:00', season: 2, episode: 11, acknowledged: '2026-10-01' });
		expect(encodeManga(entry, [])).toMatchObject({ 'External ID': 'mal:manga:2', 'MAL ID': 2, Groups: ['Dark'], 'Airtime Episode': 11,
			'Airtime Season': 2, 'Date Favorited': '2026-02-01T00:00:00Z', 'Volumes Read': 1, Favorite: true });
	});

	it('reports invalid fields and falls back to defaults', () => {
		const { entry, invalidFields } = decodeBook('Books/Y', { Name: 'Y', Status: 'Nope', 'Pages Read': 'many', ...base }, []);
		expect(invalidFields).toEqual(expect.arrayContaining(['Status', 'Pages Read']));
		expect(entry.pagesRead).toBe(0);
		expect(entry.status).toBe('Plan to Read');
	});

	it('omits airtime keys when no schedule', () => {
		const out = encodeBook(decodeBook('Books/Z', { Name: 'Z', Status: 'Reading', ...base }, []).entry, []);
		expect(Object.keys(out).some(k => k.startsWith('Airtime'))).toBe(false);
	});

	it.each([
		['book', (fm: Record<string, unknown>) => decodeBook('Books/E', fm, []).entry],
		['manga', (fm: Record<string, unknown>) => decodeManga('Manga/E', fm, []).entry],
	])('leaves optional keys missing on a decoded %s without them', (_kind, decode) => {
		const entry = decode({ Name: 'E', Status: 'Reading', ...base });
		for (const key of ['favorite', 'dateFavorited', 'externalLink', 'groups', 'airtime']) {
			expect(entry).not.toHaveProperty(key);
		}
	});

	it('stores custom fields as "Custom <name>", never as cf_*', () => {
		const fm = encodeBook({ ...fullBook(), customFields: { 'col-1': 'Paperback' } }, COLS);
		expect(fm['Custom Format']).toBe('Paperback');
		expect(Object.keys(fm).some((k) => k.startsWith('cf_'))).toBe(false);
		expect(Object.keys(fm)).not.toContain('Custom Year');
	});

	it('skips custom values whose column is gone', () => {
		const fm = encodeManga({ ...fullManga(), customFields: { gone: 'x' } }, COLS);
		expect(Object.keys(fm).some((k) => k.startsWith('Custom '))).toBe(false);
	});

	it('ignores Custom keys of unknown columns and legacy cf_ keys', () => {
		const { entry, invalidFields } = decodeBook('Books/D', { Name: 'D', ...base, 'Custom Unknown': 'x', cf_col_1: 'old' }, COLS);
		expect(entry.customFields).toEqual({});
		expect(invalidFields).toEqual([]);
	});

	it('reports a custom value of the wrong type as invalid', () => {
		const { entry, invalidFields } = decodeManga('Manga/D', { Name: 'D', ...base, 'Custom Format': ['a'], 'Custom Year': true }, COLS);
		expect(entry.customFields).toEqual({});
		expect(invalidFields).toEqual(expect.arrayContaining(['Custom Format', 'Custom Year']));
	});

	it('treats null and empty custom values as absent', () => {
		const { entry, invalidFields } = decodeBook('Books/D', { Name: 'D', ...base, 'Custom Format': null, 'Custom Year': '' }, COLS);
		expect(entry.customFields).toEqual({});
		expect(invalidFields).toEqual([]);
	});
});
