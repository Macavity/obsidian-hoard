import type { EntryAirtime } from '../../airtime/exports';
import type { RecommendedDaily, RowsShelfLayoutEntry } from '../../../shared/domain/rows';
import type { TagDefinition } from '../../../shared/domain/tags';

export interface Game {
	id: string;
	title: string;
	developer: string;
	publisher: string;
	/** Genre, one of GamesSettings.types. */
	type: string;
	/** One of GamesSettings.statuses. */
	status: string;
	/** '' | 'Low' | 'Medium' | 'High' — the watchlist priority set. */
	priority: string;
	favorite: boolean;
	/** ISO stamp of the last favorite toggle-on; absent on pre-field favorites */
	dateFavorited?: string;
	/**
	 * Wanted, not owned yet. A flag rather than a status, so a wishlisted game keeps a
	 * real status — it can be wishlisted *and* TBA.
	 */
	wishlist: boolean;
	/** 0–5 stars (0 = unrated). */
	rating: number;
	/** Completion percentage 0–100 — games track no episode/page counters. */
	progress: number;
	/** Total minutes played (0 = untracked); displayed via formatTime. */
	playtimeMinutes: number;
	/** Achievements earned out of the total — 0 total means untracked. */
	achievementsEarned: number;
	achievementsTotal: number;
	/** Selected platform names (subset of GamesSettings.platforms). */
	platforms: string[];
	/** Game modes — any combination may be true (the Solo/Co-op/Multi pill). */
	singleplayer: boolean;
	coop: boolean;
	multiplayer: boolean;
	coverUrl: string;
	/**
	 * Which games API resolved this entry ('' = manual or pre-field) and its id there,
	 * stored as a string. Lets a cover be re-fetched by id instead of by title.
	 */
	apiSource: '' | 'rawg' | 'igdb' | 'steam';
	apiId: string;
	/**
	 * Steam appid, as a string ('' when unlinked). Independent of apiSource — a RAWG
	 * game gets one the first time a sync matches it, making later syncs exact.
	 */
	steamAppId: string;
	/**
	 * Last-played from Steam (ISO), null when never played or never synced. Games have
	 * no session history, so this is all "Recently played" has besides dateModified.
	 */
	lastPlayed: string | null;
	/** Preferred store page (Steam → GOG → Epic priority when API-filled). */
	storeUrl: string;
	externalLink: string;
	vaultPage: string;
	releaseDate: string | null;
	dateStarted: string | null;
	dateFinished: string | null;
	dateAdded: string;
	dateModified: string;
	/** group names (frontmatter `groups`) */
	groups?: string[];
	/** manual Upcoming schedule (frontmatter airtime* keys); absent = none or derived from releaseDate */
	airtime?: EntryAirtime;
}

export interface GamesSettings {
	defaultFolder: string;
	defaultStatus: string;
	/**
	 * User-configurable status list with colors (the watchlist TagDefinition pattern,
	 * unlike Reading's fixed union).
	 */
	statuses: TagDefinition[];
	/** User-configurable genre list with colors. */
	types: TagDefinition[];
	/**
	 * Platform toggles with colors (Settings → Customize → Games). `Game.platforms`
	 * stores platform *names*, so renaming one here does not rewrite the games that
	 * reference it (same as watchlist types).
	 */
	platforms: TagDefinition[];
	/** Games Rows shelf order + visibility (own shelf registry). */
	rowsLayout?: RowsShelfLayoutEntry[];
	/** The Games tab's single saved filter preset (the Watchlist pattern). */
	savedFilterPreset?: GamesSavedFilterPreset | null;
}

/** The Games saved filter preset — SavedFilterPreset plus a Platform section. */
export interface GamesSavedFilterPreset {
	genreExclude: string[];
	statusExclude: string[];
	ratingExclude: string[];
	priorityExclude: string[];
	platformExclude: string[];
	groupExclude: string[];
	ratingEmptyOnly?: boolean;
	/** written by WatchLog only — read once by migratePriorityExclude, never written */
	priorityEmptyOnly?: boolean;
	recentlyArrivedOnly?: boolean;
	favoritesOnly?: boolean;
	wishlistOnly?: boolean;
	groupsOnly?: boolean;
}

/** A named bundle of related games (the HoardGroup pattern). */
export interface GameGroup {
	id: string;
	name: string;
	gameIds: string[];
	dateAdded: string;
}

export interface GamesData {
	games: Game[];
	groups: GameGroup[];
	settings: GamesSettings;
	/** Daily "Recommended" shelf picks (the Watchlist RecommendedDaily pattern). */
	recommendedDaily?: RecommendedDaily;
}

// Roles other modules see instead of the concrete GameDataManager.





export type OpenSteamSync = () => void;