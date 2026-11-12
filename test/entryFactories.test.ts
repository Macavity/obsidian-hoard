import { afterEach, describe, expect, it, vi } from 'vitest';
import { completedEpisodes, newBook, newGame, newManga, newTitle } from '../src/entryFactories';

const NOW = '2026-03-04T05:06:07.000Z';

afterEach(() => { vi.useRealTimers(); });

describe('newTitle', () => {
	it('fills every required field from id, title and type', () => {
		expect(newTitle({ id: 'Movie/Dune', title: 'Dune', type: 'Movie' }, NOW)).toStrictEqual({
			id: 'Movie/Dune', title: 'Dune', type: 'Movie', status: 'Plan to watch', priority: '', review: '', rating: 0, notes: '',
			dateStarted: null, dateFinished: null, dateAdded: NOW, dateModified: NOW, totalEpisodes: 0, episodeDuration: 0,
			releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [],
		});
	});

	it('lets the caller\'s fields win over the defaults and carries optional ones', () => {
		const t = newTitle({ id: 'i', title: 'T', type: 'Anime', status: 'Watching', rating: 4, favorite: false, malId: 0 }, NOW);
		expect(t).toMatchObject({ status: 'Watching', rating: 4, favorite: false, malId: 0 });
	});

	it('leaves out a field passed as undefined and keeps the default', () => {
		const t = newTitle({ id: 'i', title: 'T', type: 'Anime', rating: undefined, director: undefined, watchedEpisodes: undefined }, NOW);
		expect(t.rating).toBe(0);
		expect(t.watchedEpisodes).toEqual([]);
		expect(Object.keys(t)).not.toContain('director');
	});

	it('gives each title its own arrays', () => {
		const a = newTitle({ id: 'a', title: 'A', type: 'Anime' }, NOW);
		a.seasons.push({ name: 'S1', episodes: 1, offset: 0 });
		a.watchedEpisodes.push(1);
		const b = newTitle({ id: 'b', title: 'B', type: 'Anime' }, NOW);
		expect(b.seasons).toEqual([]);
		expect(b.watchedEpisodes).toEqual([]);
	});

	it('stamps both dates with the current time when no time is given', () => {
		vi.setSystemTime(NOW);
		const t = newTitle({ id: 'i', title: 'T', type: 'Anime' });
		expect([t.dateAdded, t.dateModified]).toEqual([NOW, NOW]);
	});
});

describe('newGame', () => {
	it('fills every required field from id, title, type and status', () => {
		expect(newGame({ id: 'Games/Hades', title: 'Hades', type: 'Action', status: 'Backlog' }, NOW)).toStrictEqual({
			id: 'Games/Hades', title: 'Hades', type: 'Action', status: 'Backlog', developer: '', publisher: '', priority: '',
			favorite: false, wishlist: false, rating: 0, progress: 0, playtimeMinutes: 0, achievementsEarned: 0, achievementsTotal: 0,
			platforms: [], singleplayer: false, coop: false, multiplayer: false, coverUrl: '', apiSource: '', apiId: '', steamAppId: '',
			lastPlayed: null, storeUrl: '', externalLink: '', vaultPage: '', releaseDate: null, dateStarted: null, dateFinished: null,
			dateAdded: NOW, dateModified: NOW,
		});
	});

	it('lets the caller\'s fields win and leaves out undefined ones', () => {
		const g = newGame({ id: 'i', title: 'T', type: '', status: '', coverUrl: '', playtimeMinutes: 90, developer: undefined, groups: undefined }, NOW);
		expect(g).toMatchObject({ coverUrl: '', playtimeMinutes: 90, developer: '' });
		expect(Object.keys(g)).not.toContain('groups');
	});

	it('gives each game its own platforms array', () => {
		const a = newGame({ id: 'a', title: 'A', type: '', status: '' }, NOW);
		a.platforms.push('PC');
		expect(newGame({ id: 'b', title: 'B', type: '', status: '' }, NOW).platforms).toEqual([]);
	});

	it('stamps both dates with the current time when no time is given', () => {
		vi.setSystemTime(NOW);
		const g = newGame({ id: 'i', title: 'T', type: '', status: '' });
		expect([g.dateAdded, g.dateModified]).toEqual([NOW, NOW]);
	});
});

describe('newBook', () => {
	it('fills every required field from id and title', () => {
		expect(newBook({ id: 'Books/Dune', title: 'Dune' }, NOW)).toStrictEqual({
			id: 'Books/Dune', title: 'Dune', author: '', status: 'Plan to Read', rating: 0, progressUnit: 'pages', pagesRead: 0,
			totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0, coverUrl: '', googleBooksId: '',
			openLibraryId: '', vaultPage: '', dateStarted: null, dateFinished: null, releaseDate: null, dateAdded: NOW, dateModified: NOW,
			customFields: {},
		});
	});

	it('lets the caller\'s fields win and leaves out undefined ones', () => {
		const b = newBook({ id: 'i', title: 'T', status: 'Reading', externalLink: '', author: undefined, favorite: undefined }, NOW);
		expect(b).toMatchObject({ status: 'Reading', externalLink: '', author: '' });
		expect(Object.keys(b)).not.toContain('favorite');
	});

	it('gives each book its own custom fields', () => {
		const a = newBook({ id: 'a', title: 'A' }, NOW);
		a.customFields['c'] = 'x';
		expect(newBook({ id: 'b', title: 'B' }, NOW).customFields).toEqual({});
	});
});

describe('newManga', () => {
	it('fills every required field from id and title', () => {
		expect(newManga({ id: 'Manga/Akira', title: 'Akira' }, NOW)).toStrictEqual({
			id: 'Manga/Akira', title: 'Akira', author: '', status: 'Plan to Read', rating: 0, chaptersRead: 0, totalChapters: 0,
			volumesRead: 0, totalVolumes: 0, coverUrl: '', malId: '', vaultPage: '', dateStarted: null, dateFinished: null,
			releaseDate: null, dateAdded: NOW, dateModified: NOW, customFields: {},
		});
	});

	it('lets the caller\'s fields win and leaves out undefined ones', () => {
		const m = newManga({ id: 'i', title: 'T', malId: '42', volumesRead: undefined, groups: undefined }, NOW);
		expect(m).toMatchObject({ malId: '42', volumesRead: 0 });
		expect(Object.keys(m)).not.toContain('groups');
	});

	it('gives each manga its own custom fields', () => {
		const a = newManga({ id: 'a', title: 'A' }, NOW);
		a.customFields['c'] = 'x';
		expect(newManga({ id: 'b', title: 'B' }, NOW).customFields).toEqual({});
	});
});

describe('completedEpisodes', () => {
	it('lists every episode of a Completed title', () => {
		expect(completedEpisodes('Completed', 3)).toEqual([1, 2, 3]);
	});

	it('is undefined for a Completed title without episodes and for any other status', () => {
		expect(completedEpisodes('Completed', 0)).toBeUndefined();
		expect(completedEpisodes('Watching', 3)).toBeUndefined();
	});
});
