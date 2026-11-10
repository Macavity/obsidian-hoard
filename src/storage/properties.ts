/** Single source of the note property names (frontmatter keys). Constants only. */

/** Shared by every entry kind. */
export const COMMON_PROPS = {
	name: 'Name',
	type: 'Type',
	status: 'Status',
	rating: 'Rating',
	favorite: 'Favorite',
	dateFavorited: 'Date Favorited',
	dateStarted: 'Date Started',
	dateFinished: 'Date Finished',
	dateAdded: 'Date Added',
	dateModified: 'Date Modified',
	releaseDate: 'Release Date',
	url: 'URL',
	externalId: 'External ID',
	groups: 'Groups',
	cover: 'Cover',
} as const;

/** Airtime tracking (titles, books, manga). */
export const AIRTIME_PROPS = {
	recurrence: 'Airtime Recurrence',
	day: 'Airtime Day',
	time: 'Airtime Time',
	season: 'Airtime Season',
	episode: 'Airtime Episode',
	acknowledged: 'Airtime Acknowledged',
} as const;

/** Watchlist titles only. */
export const TITLE_PROPS = {
	priority: 'Priority',
	review: 'Review',
	progress: 'Progress',
	totalEpisodes: 'Total Episodes',
	runtime: 'Runtime',
	malId: 'MAL ID',
	anilistId: 'AniList ID',
	communityRating: 'Community Rating',
	communityVotes: 'Community Votes',
	communitySource: 'Community Source',
	director: 'Director',
	cast: 'Cast',
	studio: 'Studio',
	addedDirector: 'Added Director',
	addedCast: 'Added Cast',
	addedStudio: 'Added Studio',
	trailer: 'Trailer',
	pinned: 'Pinned',
	maybe: 'Maybe',
	watchedEpisodes: 'Watched Episodes',
	skippedEpisodes: 'Skipped Episodes',
	seasons: 'Seasons',
} as const;

/** Books and manga. */
export const READING_PROPS = {
	author: 'Author',
	chaptersRead: 'Chapters Read',
	totalChapters: 'Total Chapters',
	pagesRead: 'Pages Read',
	totalPages: 'Total Pages',
	progressUnit: 'Progress Unit',
	wordsRead: 'Words Read',
	totalWords: 'Total Words',
	googleBooksId: 'Google Books ID',
	volumesRead: 'Volumes Read',
	totalVolumes: 'Total Volumes',
	malId: 'MAL ID',
} as const;

/** Games. */
export const GAME_PROPS = {
	developer: 'Developer',
	publisher: 'Publisher',
	genre: 'Genre',
	priority: 'Priority',
	wishlist: 'Wishlist',
	progress: 'Progress',
	playtime: 'Playtime',
	achievements: 'Achievements',
	platforms: 'Platforms',
	singleplayer: 'Singleplayer',
	coop: 'Co-op',
	multiplayer: 'Multiplayer',
	steamAppId: 'Steam App ID',
	storeUrl: 'Store URL',
	lastPlayed: 'Last Played',
} as const;

/** Every property name Hoard writes, deduplicated. */
export const ALL_PROPERTY_NAMES: readonly string[] = [
	...new Set<string>([
		...Object.values(COMMON_PROPS),
		...Object.values(AIRTIME_PROPS),
		...Object.values(TITLE_PROPS),
		...Object.values(READING_PROPS),
		...Object.values(GAME_PROPS),
	]),
];
