/** What a watchlist title is at its source; stored in the note property `Source Type`. `Type` stays a user label. */
export type SourceType = 'Anime' | 'Movie' | 'Series';

export const SOURCE_TYPES: readonly SourceType[] = ['Anime', 'Movie', 'Series'];

/** Exact match only: anything else (wrong case, other language, non-string) is not a Source Type. */
export function parseSourceType(v: unknown): SourceType | undefined {
	return SOURCE_TYPES.find((s) => s === v);
}

/** Which API family looks the title up; '' when the kind is unknown. */
export function apiGroupOf(t: { sourceType?: SourceType }): 'anime' | 'movie' | '' {
	if (t.sourceType === 'Anime') return 'anime';
	return t.sourceType ? 'movie' : '';
}

/** The TMDB media kind; null for anime (not TMDB-keyed) and for an unknown kind. */
export function mediaKindOf(t: { sourceType?: SourceType }): 'movie' | 'tv' | null {
	if (t.sourceType === 'Movie') return 'movie';
	return t.sourceType === 'Series' ? 'tv' : null;
}

export function isMovie(t: { sourceType?: SourceType }): boolean {
	return t.sourceType === 'Movie';
}

export function isAnime(t: { sourceType?: SourceType }): boolean {
	return t.sourceType === 'Anime';
}
