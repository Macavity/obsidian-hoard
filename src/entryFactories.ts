import type { Book, Game, HoardTitle, Manga } from './types';
import { defined } from './storage/sharedHelpers';

/**
 * New library entries. Each factory owns the defaults of its kind: a caller passes what it knows,
 * a field passed as `undefined` is left out and never replaces a default. `now` stamps both dates.
 * The WatchLog import does not use these; its defaults describe the old format.
 */

export type NewTitle = Pick<HoardTitle, 'id' | 'title' | 'type'> & Partial<HoardTitle>;
export type NewGame = Pick<Game, 'id' | 'title' | 'type' | 'status'> & Partial<Game>;
export type NewBook = Pick<Book, 'id' | 'title'> & Partial<Book>;
export type NewManga = Pick<Manga, 'id' | 'title'> & Partial<Manga>;

const isoNow = (): string => new Date().toISOString();

export function newTitle(fields: NewTitle, now = isoNow()): HoardTitle {
	const { id, title, type, ...rest } = fields;
	return {
		id,
		title,
		type,
		status: 'Plan to watch',
		priority: '',
		review: '',
		rating: 0,
		notes: '',
		dateStarted: null,
		dateFinished: null,
		dateAdded: now,
		dateModified: now,
		totalEpisodes: 0,
		episodeDuration: 0,
		releaseDate: null,
		externalLink: '',
		seasons: [],
		watchedEpisodes: [],
		...defined(rest),
	};
}

export function newGame(fields: NewGame, now = isoNow()): Game {
	const { id, title, type, status, ...rest } = fields;
	return {
		id,
		title,
		type,
		status,
		developer: '',
		publisher: '',
		priority: '',
		favorite: false,
		wishlist: false,
		rating: 0,
		progress: 0,
		playtimeMinutes: 0,
		achievementsEarned: 0,
		achievementsTotal: 0,
		platforms: [],
		singleplayer: false,
		coop: false,
		multiplayer: false,
		coverUrl: '',
		apiSource: '',
		apiId: '',
		steamAppId: '',
		lastPlayed: null,
		storeUrl: '',
		externalLink: '',
		vaultPage: '',
		releaseDate: null,
		dateStarted: null,
		dateFinished: null,
		dateAdded: now,
		dateModified: now,
		...defined(rest),
	};
}

/** What books and manga share. */
function readingDefaults(now: string) {
	return {
		author: '',
		status: 'Plan to Read' as const,
		rating: 0,
		chaptersRead: 0,
		totalChapters: 0,
		coverUrl: '',
		vaultPage: '',
		dateStarted: null,
		dateFinished: null,
		releaseDate: null,
		dateAdded: now,
		dateModified: now,
		customFields: {},
	};
}

export function newBook(fields: NewBook, now = isoNow()): Book {
	const { id, title, ...rest } = fields;
	return {
		id,
		title,
		...readingDefaults(now),
		progressUnit: 'pages',
		pagesRead: 0,
		totalPages: 0,
		wordsRead: 0,
		totalWords: 0,
		googleBooksId: '',
		openLibraryId: '',
		...defined(rest),
	};
}

export function newManga(fields: NewManga, now = isoNow()): Manga {
	const { id, title, ...rest } = fields;
	return {
		id,
		title,
		...readingDefaults(now),
		volumesRead: 0,
		totalVolumes: 0,
		malId: '',
		...defined(rest),
	};
}

/** A Completed title has every episode ticked: the full list when that applies, else undefined. */
export function completedEpisodes(status: string, totalEpisodes: number): number[] | undefined {
	return status === 'Completed' && totalEpisodes > 0
		? Array.from({ length: totalEpisodes }, (_, i) => i + 1)
		: undefined;
}
