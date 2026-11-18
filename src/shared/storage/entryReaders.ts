import { READING_STATUSES } from '../domain/types';
import type {
	AirtimeRecurrence, Book, EntryAirtime, Game, GameGroup, HoardTitle, Manga, MaybeTitle, ReadingStatus, TitleOverrides,
} from '../domain/types';
import { newBook, newGame, newManga, newTitle } from '../domain/entryFactories';
import { readSeason } from './readCache';
import { at, readList, readOptionalNumber, readOptionalString, readString, readStringList } from '../domain/read';
import { defined, isRecord } from '../domain/sharedHelpers';

/**
 * The entries of a backup, read field by field. An entry needs a text `id` and `title`; everything
 * else that is missing or of the wrong type takes the factory's empty value (or stays absent when
 * the field is optional), so a restore never meets a field the code downstream takes for granted.
 */

const RECURRENCES: readonly AirtimeRecurrence[] = ['once', 'daily', 'weekly', 'monthly'];
const GAME_SOURCES = ['rawg', 'igdb', 'steam'] as const;
const PROGRESS_UNITS = ['pages', 'words'] as const;
const MEDIA_TYPES = ['movie', 'tv'] as const;

const text = (v: unknown, key: string): string | undefined => {
	const x = at(v, key);
	return typeof x === 'string' ? x : undefined;
};
const num = (v: unknown, key: string): number | undefined => readOptionalNumber(at(v, key));
const flag = (v: unknown, key: string): boolean | undefined => {
	const x = at(v, key);
	return typeof x === 'boolean' ? x : undefined;
};
/** A date: text or null as stored; anything else is left to the default (null). */
const date = (v: unknown, key: string): string | null | undefined => {
	const x = at(v, key);
	return typeof x === 'string' || x === null ? x : undefined;
};
/** A list that is absent when the stored value is no list. */
const list = (v: unknown, key: string): string[] | undefined => {
	const x = at(v, key);
	return Array.isArray(x) ? readStringList(x) : undefined;
};
const optText = (v: unknown, key: string): string | undefined => readOptionalString(at(v, key));

function readAirtime(v: unknown): EntryAirtime | undefined {
	const recurrence = RECURRENCES.find((r) => r === at(v, 'recurrence'));
	if (!recurrence) return undefined;
	return {
		recurrence,
		...defined({ day: num(v, 'day'), time: optText(v, 'time'), season: num(v, 'season'), episode: num(v, 'episode'), acknowledged: optText(v, 'acknowledged') }),
	};
}

function readRef(v: unknown): { season: number; episode: number } | undefined {
	const season = num(v, 'season');
	const episode = num(v, 'episode');
	return season !== undefined && episode !== undefined ? { season, episode } : undefined;
}

function readOverrides(v: unknown): TitleOverrides | undefined {
	if (!isRecord(v)) return undefined;
	return defined({
		director: list(v, 'director'), cast: list(v, 'cast'), studio: list(v, 'studio'),
		communityRating: num(v, 'communityRating'), communityVotes: num(v, 'communityVotes'), communitySource: optText(v, 'communitySource'),
	});
}

const readCustomFields = (v: unknown): Record<string, string | number> => {
	const out: Record<string, string | number> = {};
	if (!isRecord(v)) return out;
	for (const [key, value] of Object.entries(v)) {
		if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
	}
	return out;
};

/** The id and title every entry is told apart by; undefined when either is missing. */
function identity(v: unknown): { id: string; title: string } | undefined {
	const id = text(v, 'id');
	const title = text(v, 'title');
	return id !== undefined && title !== undefined ? { id, title } : undefined;
}

export function readTitle(v: unknown): HoardTitle | undefined {
	const who = identity(v);
	if (!who) return undefined;
	const unmappedWatched = readList(at(v, 'unmappedWatched'), readRef);
	const unmappedSkipped = readList(at(v, 'unmappedSkipped'), readRef);
	return newTitle({
		...who,
		type: text(v, 'type') ?? 'TV Show',
		...defined({
			status: text(v, 'status'), priority: text(v, 'priority'), review: text(v, 'review'), notes: text(v, 'notes'),
			rating: num(v, 'rating'), totalEpisodes: num(v, 'totalEpisodes'), episodeDuration: num(v, 'episodeDuration'),
			dateStarted: date(v, 'dateStarted'), dateFinished: date(v, 'dateFinished'), releaseDate: date(v, 'releaseDate'),
			dateAdded: text(v, 'dateAdded'), dateModified: text(v, 'dateModified'), externalLink: text(v, 'externalLink'),
			seasons: Array.isArray(at(v, 'seasons')) ? readList(at(v, 'seasons'), readSeason) : undefined,
			watchedEpisodes: Array.isArray(at(v, 'watchedEpisodes')) ? readList(at(v, 'watchedEpisodes'), readOptionalNumber) : undefined,
			malId: num(v, 'malId'), anilistId: num(v, 'anilistId'), tmdbId: num(v, 'tmdbId'), collectionId: num(v, 'collectionId'),
			tmdbMediaType: MEDIA_TYPES.find((t) => t === at(v, 'tmdbMediaType')),
			communityRating: num(v, 'communityRating'), communityVotes: num(v, 'communityVotes'),
			communitySource: optText(v, 'communitySource'), communityRatingLastFetched: optText(v, 'communityRatingLastFetched'),
			pinned: flag(v, 'pinned'), favorite: flag(v, 'favorite'), dateFavorited: optText(v, 'dateFavorited'),
			posterUrl: optText(v, 'posterUrl'), trailerUrl: optText(v, 'trailerUrl'), manualTrailerUrl: optText(v, 'manualTrailerUrl'),
			director: list(v, 'director'), cast: list(v, 'cast'), studio: list(v, 'studio'),
			manualDirector: list(v, 'manualDirector'), manualCast: list(v, 'manualCast'), manualStudio: list(v, 'manualStudio'),
			maybe: flag(v, 'maybe'), seasonsOverride: flag(v, 'seasonsOverride'), groups: list(v, 'groups'),
			unmappedWatched: unmappedWatched.length > 0 ? unmappedWatched : undefined,
			unmappedSkipped: unmappedSkipped.length > 0 ? unmappedSkipped : undefined,
			airtime: readAirtime(at(v, 'airtime')), overrides: readOverrides(at(v, 'overrides')),
		}),
	});
}

export function readMaybe(v: unknown): MaybeTitle | undefined {
	const who = identity(v);
	if (!who) return undefined;
	return {
		...who,
		type: text(v, 'type') ?? 'TV Show',
		releaseDate: date(v, 'releaseDate') ?? null,
		externalLink: text(v, 'externalLink') ?? '',
		totalEpisodes: num(v, 'totalEpisodes') ?? 0,
		episodeDuration: num(v, 'episodeDuration') ?? 0,
		dateAdded: text(v, 'dateAdded') ?? '',
	};
}

const readStatus = (v: unknown): ReadingStatus | undefined => READING_STATUSES.find((s) => s === at(v, 'status'));

/** The fields a book and a manga share. */
function readingFields(v: unknown) {
	return defined({
		author: text(v, 'author'), status: readStatus(v), rating: num(v, 'rating'),
		chaptersRead: num(v, 'chaptersRead'), totalChapters: num(v, 'totalChapters'), coverUrl: text(v, 'coverUrl'),
		vaultPage: text(v, 'vaultPage'), dateStarted: date(v, 'dateStarted'), dateFinished: date(v, 'dateFinished'),
		releaseDate: date(v, 'releaseDate'), dateAdded: text(v, 'dateAdded') ?? '', dateModified: text(v, 'dateModified') ?? '',
		customFields: isRecord(at(v, 'customFields')) ? readCustomFields(at(v, 'customFields')) : undefined,
		favorite: flag(v, 'favorite'), dateFavorited: optText(v, 'dateFavorited'), externalLink: optText(v, 'externalLink'),
		groups: list(v, 'groups'), airtime: readAirtime(at(v, 'airtime')),
	});
}

export function readBook(v: unknown): Book | undefined {
	const who = identity(v);
	if (!who) return undefined;
	return newBook({
		...who,
		...readingFields(v),
		...defined({
			progressUnit: PROGRESS_UNITS.find((u) => u === at(v, 'progressUnit')),
			pagesRead: num(v, 'pagesRead'), totalPages: num(v, 'totalPages'), wordsRead: num(v, 'wordsRead'), totalWords: num(v, 'totalWords'),
			googleBooksId: text(v, 'googleBooksId'), openLibraryId: text(v, 'openLibraryId'),
		}),
	});
}

export function readManga(v: unknown): Manga | undefined {
	const who = identity(v);
	if (!who) return undefined;
	return newManga({
		...who,
		...readingFields(v),
		...defined({ volumesRead: num(v, 'volumesRead'), totalVolumes: num(v, 'totalVolumes'), malId: text(v, 'malId') }),
	});
}

export function readGame(v: unknown): Game | undefined {
	const who = identity(v);
	if (!who) return undefined;
	return newGame({
		...who,
		type: text(v, 'type') ?? '',
		status: text(v, 'status') ?? 'Not started',
		...defined({
			developer: text(v, 'developer'), publisher: text(v, 'publisher'), priority: text(v, 'priority'),
			favorite: flag(v, 'favorite'), wishlist: flag(v, 'wishlist'), rating: num(v, 'rating'), progress: num(v, 'progress'),
			playtimeMinutes: num(v, 'playtimeMinutes'), achievementsEarned: num(v, 'achievementsEarned'),
			achievementsTotal: num(v, 'achievementsTotal'), platforms: list(v, 'platforms'),
			singleplayer: flag(v, 'singleplayer'), coop: flag(v, 'coop'), multiplayer: flag(v, 'multiplayer'),
			coverUrl: text(v, 'coverUrl'), apiSource: GAME_SOURCES.find((s) => s === at(v, 'apiSource')),
			apiId: text(v, 'apiId'), steamAppId: text(v, 'steamAppId'), lastPlayed: date(v, 'lastPlayed'),
			storeUrl: text(v, 'storeUrl'), externalLink: text(v, 'externalLink'), vaultPage: text(v, 'vaultPage'),
			releaseDate: date(v, 'releaseDate'), dateStarted: date(v, 'dateStarted'), dateFinished: date(v, 'dateFinished'),
			dateAdded: text(v, 'dateAdded') ?? '', dateModified: text(v, 'dateModified') ?? '',
			dateFavorited: optText(v, 'dateFavorited'), groups: list(v, 'groups'), airtime: readAirtime(at(v, 'airtime')),
		}),
	});
}

export function readGameGroup(v: unknown): GameGroup | undefined {
	const id = at(v, 'id');
	const name = at(v, 'name');
	if (typeof id !== 'string' || typeof name !== 'string') return undefined;
	return { id, name, gameIds: readStringList(at(v, 'gameIds')), dateAdded: readString(at(v, 'dateAdded')) };
}
