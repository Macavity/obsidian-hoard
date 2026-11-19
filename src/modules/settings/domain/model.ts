import type { CustomListColumn } from '../../../shared/domain/columns';
import type { RatingTier, TagDefinition } from '../../../shared/domain/tags';
import type { RowsShelfLayoutEntry } from '../../../shared/domain/rows';

/** Card text placement: below the poster or overlaid at its bottom. */
export type CardTextStyle = 'under' | 'inside';

/** The four tabs whose poster cards honour a per-tab text placement. */
export type CardStyleTab = 'watchlist' | 'games' | 'reading' | 'upcoming';

export interface HoardPluginSettings {
	colorTheme: 'default' | 'nightfall' | 'bluez';
	/**
	 * How dates are displayed and parsed. Storage is unaffected — date-only fields stay
	 * `YYYY-MM-DD` and dateAdded/dateModified stay ISO timestamps.
	 */
	dateFormat: DateFormatPref;
	// last-used Watchlist view, written on every switch (the Upcoming pattern);
	// the old 'cards' value migrates to 'rows' in loadSettings
	defaultWatchlistView: 'list' | 'rows';
	autoCompleteOnLastEpisode: boolean;
	setFinishDateAutomatically: boolean;
	omdbApiKey: string;
	tmdbApiKey: string;
	googleBooksApiKey: string;
	/** Which API books are searched on; falls back to Open Library without a Google key. Device-local. */
	booksApiSource: 'openlibrary' | 'google';
	activeApi: 'Cinemeta' | 'OMDb' | 'TMDB';
	animeApiSource: 'jikan' | 'anilist';
	/** Jikan-v4-compatible endpoint for anime and manga; '' = Tenrai. Device-local. */
	jikanBaseUrl: string;
	/** Which API new games are searched on (existing games keep their data). */
	gamesApiSource: 'steam' | 'rawg' | 'igdb';
	rawgApiKey: string;
	/** IGDB authenticates through Twitch — a registered app's Client ID + Secret. */
	igdbClientId: string;
	igdbClientSecret: string;
	/**
	 * Steam is a sync layer, not a search source (no search endpoint) — it fills
	 * playtime/achievements, so it needs a Web API key plus the SteamID64 to read.
	 */
	steamApiKey: string;
	steamId: string;
	typeApiMapping: Record<string, 'anime' | 'movie' | ''>;
	types: TagDefinition[];
	statuses: TagDefinition[];
	reviews: TagDefinition[];
	priorities: TagDefinition[];
	autoCreateFolders: boolean;
	coloredTypeBadges: boolean;
	/** Open the panel on the Watchlist tab after the Add title command adds something. */
	openWatchlistAfterAdd: boolean;
	seasonPalette: string[];
	dashboardCardStyle: 'circles' | 'rectangles';
	/**
	 * Card size step for every grid and shelf: −3..+3, 0 = default (160px minimum width,
	 * see CARD_SIZE_WIDTHS). Desktop and mobile are independent.
	 */
	cardSize: number;
	cardSizeMobile: number;
	/**
	 * Per-tab card text placement: 'under' = block below the poster (Reading/Upcoming
	 * style), 'inside' = overlaid at its bottom (Watchlist style). Status badges stay
	 * inside either way.
	 */
	cardTextStyles: Record<CardStyleTab, CardTextStyle>;
	/** Allow 0.5-step star ratings (Watchlist and Reading alike). */
	halfStarRatings: boolean;
	/**
	 * Five-tier rating system (colour + label for 1★…5★), shared by every star control.
	 * Always five entries; index 0 = 1★.
	 */
	ratingSystem: RatingTier[];
	episodeNumbering: 'absolute' | 'per-season';
	/**
	 * Type preselected in the Add modal: a real `types[].name`, or LAST_USED_TYPE_SENTINEL
	 * to follow the last added type.
	 */
	defaultAddType: string;
	/** Type slug of the most recently added title. Updated silently on every add. */
	lastAddedType: string;
	/** How many entries the Dashboard "Top Directors" / "Top Actors" lists show. */
	dashboardTopCredits: number;
	/** Colors for the Reading type badges (Manga / Book). */
	readingTypeColors: { manga: string; book: string };
	defaultCustomColumns: CustomListColumn[];
	listFilters: {
		typeExclude: string[];
		statusExclude: string[];
		groupExclude: string[];
		ratingExclude: string[];
		priorityExclude: string[];
		sort: string;
		sortDir?: 'asc' | 'desc';
		secondSort?: string;
		secondSortDir?: 'asc' | 'desc';
		ratingEmptyOnly?: boolean;
		/** written by WatchLog only — read once by migratePriorityExclude, never written */
		priorityEmptyOnly?: boolean;
		recentlyArrivedOnly?: boolean;
		groupsOnly?: boolean;
		favoritesOnly?: boolean;
	};
	/** Games tab filter/sort state (the listFilters pattern — persisted live). */
	gamesFilters: {
		genreExclude: string[];
		statusExclude: string[];
		ratingExclude: string[];
		priorityExclude: string[];
		platformExclude: string[];
		groupExclude: string[];
		sort: string;
		sortDir?: 'asc' | 'desc';
		secondSort?: string;
		secondSortDir?: 'asc' | 'desc';
		ratingEmptyOnly?: boolean;
		/** written by WatchLog only — read once by migratePriorityExclude, never written */
		priorityEmptyOnly?: boolean;
		recentlyArrivedOnly?: boolean;
		favoritesOnly?: boolean;
		wishlistOnly?: boolean;
		groupsOnly?: boolean;
	};
	draftsVaultTag: string;
	draftsAfterAdding: 'remove' | 'keep';
	customListTabOrder: string[];
	showHintBanners: boolean;
	showUpcomingStatusBar: boolean;
	/** Upcoming → Tracker presentation. Persisted from the view toggle. */
	upcomingTrackerView: 'list' | 'cards';
	/** Rows-view shelf order + visibility (see ROWS_SHELVES). */
	rowsLayout: RowsShelfLayoutEntry[];
}

/** the three orderings offered in Settings; storage is ISO regardless */
export type DateFormatPref = 'european' | 'american' | 'iso';


