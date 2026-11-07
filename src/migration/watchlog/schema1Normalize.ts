import {
	DEFAULT_READING_SETTINGS, GAME_TBA_STATUS, defaultGamesSettings, getTitleCredits, parsePlaytimeInput,
} from '../../types';
import type {
	Book, Game, GamesData, GamesSettings, HoardTitle, Manga, ReadingData, ReadingStatus,
	TagDefinition,
} from '../../types';
import { WISHLIST, isRecord, type Fm, type WatchLogTitle } from './schema1Types';

// WatchLog's load-time corrections, applied once while converting its data.

const ON_HOLD = 'On Hold';

export function isoOf(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** API-derived keys WatchLog wrote into a title note, with the values it wrote. */
export function watchLogApiValues(t: HoardTitle): Fm {
	const out: Fm = {};
	if (t.communityRating !== undefined) out.communityRating = t.communityRating;
	if (t.communityVotes !== undefined) out.communityVotes = t.communityVotes;
	if (t.communitySource) out.communitySource = t.communitySource;
	for (const field of ['director', 'cast', 'studio'] as const) {
		const names = getTitleCredits(t, field);
		if (names.length > 0) out[field] = names;
	}
	// the fetched trailer only: a manual one in the note is the user's
	if (t.trailerUrl && t.trailerUrl !== 'none') out.trailer = t.trailerUrl;
	return out;
}

export function progressOf(t: HoardTitle): number {
	const skipped = t.seasons.reduce((n, s) => n + (s.skippedEpisodes?.length ?? 0), 0);
	const effective = Math.max(0, t.totalEpisodes - skipped);
	return effective === 0 ? 0 : Math.min(100, Math.round((t.watchedEpisodes.length / effective) * 100));
}

export function normalizeTitle(raw: Partial<WatchLogTitle>): WatchLogTitle {
	const t: WatchLogTitle = {
		id: '', title: '', type: 'TV Show', status: 'Plan to watch', priority: 'Medium', review: '', rating: 0,
		notes: '', dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 0,
		episodeDuration: 0, releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [],
		...raw,
	};
	if (!Array.isArray(t.seasons)) t.seasons = [];
	if (!Array.isArray(t.watchedEpisodes)) t.watchedEpisodes = [];
	if (typeof t.notes !== 'string') t.notes = '';
	if (typeof t.externalLink !== 'string') t.externalLink = '';
	return t;
}

function readingStatus<T extends { status: ReadingStatus }>(item: T): T {
	if ((item.status as string) === ON_HOLD) item.status = 'Plan to Read';
	return item;
}

export function normalizeReading(raw: ReadingData | undefined): ReadingData {
	const settings = { ...DEFAULT_READING_SETTINGS, ...(isRecord(raw?.settings) ? raw.settings : {}) };
	if ((settings.defaultStatus as string) === ON_HOLD) settings.defaultStatus = 'Plan to Read';
	const common = {
		author: '', status: 'Plan to Read' as ReadingStatus, rating: 0, chaptersRead: 0, totalChapters: 0,
		coverUrl: '', vaultPage: '', dateStarted: null, dateFinished: null, releaseDate: null, dateAdded: '',
		dateModified: '',
	};
	const bookDefaults = {
		...common, progressUnit: 'pages' as const, pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, googleBooksId: '',
	};
	const mangaDefaults = { ...common, volumesRead: 0, totalVolumes: 0, malId: '' };
	const books = (Array.isArray(raw?.books) ? raw.books : []).map((b): Book => readingStatus({
		...bookDefaults, ...b, customFields: isRecord(b.customFields) ? b.customFields : {},
	}));
	const manga = (Array.isArray(raw?.manga) ? raw.manga : []).map((m): Manga => readingStatus({
		...mangaDefaults, ...m, customFields: isRecord(m.customFields) ? m.customFields : {},
	}));
	return {
		books,
		manga,
		bookColumns: Array.isArray(raw?.bookColumns) ? raw.bookColumns : [],
		mangaColumns: Array.isArray(raw?.mangaColumns) ? raw.mangaColumns : [],
		settings,
	};
}

/** Applies GameDataManager's former load-time migration: platform strings, the retired Wishlist status, playtime. */
export function normalizeGames(raw: GamesData | undefined): GamesData {
	const defaults = defaultGamesSettings();
	const s: GamesSettings = { ...defaults, ...(isRecord(raw?.settings) ? raw.settings : {}) };
	if (!Array.isArray(s.statuses) || s.statuses.length === 0) s.statuses = defaults.statuses;
	if (!Array.isArray(s.types) || s.types.length === 0) s.types = defaults.types;
	s.platforms = Array.isArray(s.platforms)
		? (s.platforms as unknown[]).map((p): TagDefinition => typeof p === 'string'
			? { name: p, color: defaults.platforms.find((d) => d.name === p)?.color ?? '#888780' }
			: p as TagDefinition)
		: defaults.platforms;
	const wishlistIdx = s.statuses.findIndex((st) => st.name === WISHLIST);
	if (wishlistIdx !== -1) {
		if (s.statuses.some((st) => st.name === GAME_TBA_STATUS)) s.statuses.splice(wishlistIdx, 1);
		else s.statuses[wishlistIdx] = { name: GAME_TBA_STATUS, color: '#EAB308' };
	}
	if (s.defaultStatus === WISHLIST) s.defaultStatus = 'Not started';
	if (s.savedFilterPreset) {
		s.savedFilterPreset = {
			...s.savedFilterPreset,
			statusExclude: (s.savedFilterPreset.statusExclude ?? []).filter((n) => n !== WISHLIST),
		};
	}
	const unwished = s.defaultStatus || 'Not started';
	const gameDefaults = {
		developer: '', publisher: '', type: '', status: unwished, priority: '', favorite: false, wishlist: false,
		rating: 0, progress: 0, playtimeMinutes: 0, achievementsEarned: 0, achievementsTotal: 0,
		singleplayer: false, coop: false, multiplayer: false, coverUrl: '', apiId: '', steamAppId: '',
		lastPlayed: null, storeUrl: '', externalLink: '', vaultPage: '', releaseDate: null, dateStarted: null,
		dateFinished: null, dateAdded: '', dateModified: '',
	};

	const games = (Array.isArray(raw?.games) ? raw.games : []).map((src): Game => {
		const stored = src as Game & { playtime?: unknown };
		const { playtime, ...rest } = stored;
		const g: Game = {
			...gameDefaults,
			...rest,
			platforms: Array.isArray(rest.platforms) ? rest.platforms : [],
			apiSource: rest.apiSource === 'rawg' || rest.apiSource === 'igdb' ? rest.apiSource : '',
		};
		if (typeof stored.playtimeMinutes !== 'number') {
			g.playtimeMinutes = typeof playtime === 'string' ? parsePlaytimeInput(playtime) : 0;
		}
		if (g.status === WISHLIST) {
			g.wishlist = true;
			g.status = unwished;
		}
		return g;
	});
	return {
		games,
		groups: Array.isArray(raw?.groups) ? raw.groups : [],
		settings: s,
		recommendedDaily: raw?.recommendedDaily,
	};
}
