import { describe, expect, it } from 'vitest';
import search from './fixtures/openlibrary-search.json';
import work from './fixtures/openlibrary-work.json';
import { mapOpenLibrarySearch, mapOpenLibraryWork, openLibraryCoverUrl, openLibrarySearchUrl, openLibraryWorkUrl } from '../src/openLibraryApi';

describe('open library', () => {
	it('builds urls', () => {
		expect(openLibrarySearchUrl('the hobbit')).toBe('https://openlibrary.org/search.json?q=the%20hobbit&limit=10&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i');
		expect(openLibraryWorkUrl('OL27482W')).toBe('https://openlibrary.org/works/OL27482W.json');
		expect(openLibraryCoverUrl(14627509)).toBe('https://covers.openlibrary.org/b/id/14627509-L.jpg');
	});
	it('maps the Hobbit row', () => {
		expect(mapOpenLibrarySearch(search)[0]).toMatchObject({
			title: 'The Hobbit', author: 'J.R.R. Tolkien', year: 1937, googleBooksId: '', releaseDate: '',
			openLibraryId: 'OL27482W', totalPages: 310,
			coverUrl: 'https://covers.openlibrary.org/b/id/14627509-L.jpg',
			url: 'https://openlibrary.org/works/OL27482W',
		});
		expect(mapOpenLibrarySearch(search)[1]?.author).toBe('Charles Dixon, Sean Deming, J.R.R. Tolkien');
	});
	it('drops rows with a non-work key and handles a missing cover', () => {
		expect(mapOpenLibrarySearch({ docs: [{ key: '/books/OL1M', title: 'x' }] })).toEqual([]);
		expect(mapOpenLibrarySearch({ docs: [{ key: '/works/OL1W', title: 'x' }] })[0]).toMatchObject({ coverUrl: '', author: '', totalPages: 0, year: 0 });
	});
	it('maps a work', () => {
		expect(mapOpenLibraryWork(work)).toMatchObject({ title: 'The Hobbit', openLibraryId: 'OL27482W', author: '', totalPages: 0 });
		expect(mapOpenLibraryWork({ key: '/works/OL1W', title: 'x', first_publish_date: 'Sep 21, 1937' })).toMatchObject({ year: 1937, coverUrl: '' });
	});
	it('returns [] / null for garbage', () => {
		expect(mapOpenLibrarySearch(null)).toEqual([]);
		expect(mapOpenLibrarySearch({ docs: [null, 3, 'x'] })).toEqual([]);
		expect(mapOpenLibraryWork({ key: 'nope' })).toBeNull();
		expect(mapOpenLibraryWork(null)).toBeNull();
	});
});
