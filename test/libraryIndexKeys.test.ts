import { describe, it, expect } from 'vitest';
import { LibraryIndex, bookResultIdKeys, gameResultIdKeys } from '../src/shared/services/LibraryIndex';

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
		const idx = LibraryIndex.build({ games: () => [{ title: 'Other', apiSource: '', apiId: '', steamAppId: '1145360' }] as never }, ['games']);
		expect(idx.lookup(['steam:1145360'], 'Unrelated')).toBe('Games');
	});
	it('matches an Open Library row to a stored book', () => {
		const idx = LibraryIndex.build({ books: () => [{ title: 'Z', googleBooksId: '', openLibraryId: 'OL1W' }] as never }, ['books']);
		expect(idx.lookup(['openlibrary:OL1W'], 'Unrelated')).toBe('Books');
	});
});

describe('LibraryIndex stored-entry keys', () => {
	const title = { title: 'T', malId: '', anilistId: '', tmdbId: '', tmdbMediaType: '', externalLink: '' };
	const build = (titles: unknown[]) => LibraryIndex.build({ watchlist: () => titles as never }, ['watchlist']);

	it('keys a title by mal and anilist ids', () => {
		const idx = build([{ ...title, malId: '5', anilistId: '6' }]);
		expect(idx.lookup(['mal:5'], 'x')).toBe('Watchlist');
		expect(idx.lookup(['anilist:6'], 'x')).toBe('Watchlist');
	});
	it('keys a title by tmdb id only with a media type', () => {
		const idx = build([{ ...title, tmdbId: '1399', tmdbMediaType: 'tv' }, { ...title, title: 'U', tmdbId: '7' }]);
		expect(idx.lookup(['tmdb:tv:1399'], 'x')).toBe('Watchlist');
		expect(idx.lookup(['tmdb::7'], 'x')).toBeNull();
	});
	it('keys a title by the imdb id in its link', () => {
		const idx = build([{ ...title, externalLink: 'https://www.imdb.com/title/tt123/' }]);
		expect(idx.lookup(['imdb:tt123'], 'x')).toBe('Watchlist');
	});
	it('keys a book by Google Books id', () => {
		expect(LibraryIndex.build({ books: () => [{ title: 'B', googleBooksId: 'g1', openLibraryId: '' }] as never }, ['books']).lookup(['gbooks:g1'], 'x')).toBe('Books');
	});
	it('keys a manga by mal id, and skips one without', () => {
		const idx = LibraryIndex.build({ manga: () => [{ title: 'M', malId: '9' }, { title: 'N', malId: '' }] as never }, ['manga']);
		expect(idx.lookup(['mal:9'], 'x')).toBe('Manga');
		expect(idx.lookup(['mal:'], 'x')).toBeNull();
	});
	it('keys a game by api source and id', () => {
		expect(LibraryIndex.build({ games: () => [{ title: 'G', apiSource: 'rawg', apiId: '3', steamAppId: '' }] as never }, ['games']).lookup(['rawg:3'], 'x')).toBe('Games');
	});
});
