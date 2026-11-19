import type { EntryAirtime } from '../../airtime/exports';

export interface Season {
	name: string;
	episodes: number;
	offset: number;
	/** episodes excluded from progress (filler, recaps) */
	skippedEpisodes?: number[];
}

export interface HoardTitle {
	id: string;
	title: string;
	type: string;
	status: string;
	priority: string;
	review: string;
	rating: number;
	notes: string;
	dateStarted: string | null;
	dateFinished: string | null;
	dateAdded: string;
	dateModified: string;
	totalEpisodes: number;
	episodeDuration: number;
	releaseDate: string | null;
	externalLink: string;
	seasons: Season[];
	watchedEpisodes: number[];
	malId?: number;
	anilistId?: number;
	/** cached once resolved; which endpoint it belongs to is tmdbMediaType */
	tmdbId?: number;
	/** what tmdbId indexes. Collections require 'movie' — a tv id there would query a random film. */
	tmdbMediaType?: 'movie' | 'tv';
	/** absent = unchecked, COLLECTION_NONE = checked and there is none, else the id */
	collectionId?: number;
	communityRating?: number;
	communityVotes?: number;
	/** `imdb`, `mal`, `anilist`, `tmdb` from the APIs; a note may name any other source */
	communitySource?: string;
	communityRatingLastFetched?: string;
	pinned?: boolean;
	/** backfilled to false for titles predating the field */
	favorite?: boolean;
	/** ISO stamp of the last favorite toggle-on; absent on pre-field favorites */
	dateFavorited?: string;
	/** note property `Cover`. '' = none, else a URL */
	posterUrl?: string;
	/** '' = none, else a YouTube URL */
	trailerUrl?: string;
	/** override — wins over trailerUrl when non-empty */
	manualTrailerUrl?: string;
	/** absent/empty = none */
	director?: string[];
	/** capped at MAX_FETCHED_CREDITS; absent/empty = none */
	cast?: string[];
	/** user-added, appended after the fetched ones; a refresh never overwrites */
	manualDirector?: string[];
	/** user-added, appended after the fetched ones; a refresh never overwrites */
	manualCast?: string[];
	/** studio / network / brand. absent/empty = none */
	studio?: string[];
	/** user-added, appended after the fetched ones; a refresh never overwrites */
	manualStudio?: string[];
	/** considered, not yet in the library (frontmatter `maybe`) */
	maybe?: boolean;
	/** seasons were set by hand; frontmatter `seasons` wins over the API cache */
	seasonsOverride?: boolean;
	/** `watched`/`skipped` refs in seasons the season list does not know yet; written back unchanged */
	unmappedWatched?: { season: number; episode: number }[];
	unmappedSkipped?: { season: number; episode: number }[];
	/** group names (frontmatter `groups`) */
	groups?: string[];
	/** manual Upcoming schedule (frontmatter airtime* keys); absent = none or derived from releaseDate */
	airtime?: EntryAirtime;
	/** API fields set in the note by the user; they win over the cached API values and are written back */
	overrides?: TitleOverrides;
}

/** Note-side overrides of API data; the trailer override is manualTrailerUrl. */
export interface TitleOverrides {
	director?: string[];
	cast?: string[];
	studio?: string[];
	communityRating?: number;
	communityVotes?: number;
	communitySource?: HoardTitle['communitySource'];
}

// TMDB collections

/** which credits field a helper is operating on */
export type CreditsField = 'director' | 'cast' | 'studio';

export interface HoardGroup {
	id: string;
	name: string;
	titleIds: string[];
	dateAdded: string;
}

export interface MaybeTitle {
	id: string;
	title: string;
	type: string;
	releaseDate: string | null;
	externalLink: string;
	totalEpisodes: number;
	episodeDuration: number;
	dateAdded: string;
}

/** A running bulk import (runtime only, never persisted); `cancel` stops it. */
export interface ImportProgress {
	current: number;
	total: number;
	cancel: () => void;
}

export interface SavedFilterPreset {
	typeExclude: string[];
	statusExclude: string[];
	groupExclude: string[];
	ratingExclude: string[];
	priorityExclude: string[];
	ratingEmptyOnly?: boolean;
	/** written by WatchLog only — read once by migratePriorityExclude, never written */
	priorityEmptyOnly?: boolean;
	recentlyArrivedOnly?: boolean;
	groupsOnly?: boolean;
	favoritesOnly?: boolean;
}

export interface AnimeSearchResult {
	malId: number;
	anilistId?: number;
	title: string;
	episodes: number;
	duration: number;
	releaseDate: string;
	url: string;
	seasons: Season[];
	description?: string;
	averageScore?: number;
	genres?: string[];
	posterUrl?: string;
	/** '' = none, else a YouTube watch URL */
	trailerUrl?: string;
}

export interface MediaSearchResult {
	imdbId: string;
	title: string;
	mediaType: 'movie' | 'tv';
	episodes: number;
	episodeDuration: number;
	releaseDate: string;
	url: string;
	seasons: Season[];
	posterUrl?: string;
	/** '' = none, else a YouTube watch URL */
	trailerUrl?: string;
	/** detail lookups only: normalized name list */
	director?: string[];
	/** detail lookups only: normalized names (capped at MAX_FETCHED_CREDITS) */
	cast?: string[];
	/** detail lookups only: studio / network names */
	studio?: string[];
}

// TMDB API shapes

export interface TmdbCollectionRef {
	id: number;
	name: string;
	poster_path?: string | null;
}

/** no runtime here — adding still needs a detail call */
export interface TmdbCollectionPart {
	id: number;
	title?: string;
	release_date?: string;
	poster_path?: string | null;
	overview?: string;
}

export interface TmdbCollectionDetail {
	id: number;
	name: string;
	overview?: string;
	poster_path?: string | null;
	parts?: TmdbCollectionPart[];
}

// Roles other modules see instead of the concrete DataManager.






export interface CsvOptions {
	mode: 'export' | 'import';
}

export type OpenCsv = (opts: CsvOptions) => void;