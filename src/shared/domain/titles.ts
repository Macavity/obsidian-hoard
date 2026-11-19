import type { CreditsField, HoardTitle } from '../../modules/watchlist/contract';
import { readStringList } from './read';

/** `tt…` out of a stored `URL` property; both OMDb and TMDB adds write an imdb.com URL */
export function imdbIdFromLink(link: string | undefined): string {
	if (!link) return '';
	return link.match(/\/(tt\d+)/)?.[1] ?? '';
}

// Credits (director / cast)

/**
 * Cap on names stored from an API response. OMDb returns 4 actors; TMDB returns
 * the full cast (100+ on a big film). Fetched data only — user-added is uncapped.
 */
const MAX_FETCHED_CREDITS = 10;

/** never fetched (absent or empty) */
export function isCreditsUnfetched(names: string[] | undefined): boolean {
	return !names || names.length === 0;
}

/** fetched names only; unfetched gives [] */
export function getDisplayCredits(names: string[] | undefined): string[] {
	return names ?? [];
}

/** fetched names for a field (a note override wins), before the manual merge */
function fetchedCredits(title: HoardTitle, field: CreditsField): string[] | undefined {
	const override = title.overrides?.[field];
	if (override) return override;
	if (field === 'director') return title.director;
	if (field === 'cast') return title.cast;
	return title.studio;
}

/** user-added names */
export function getManualCredits(title: HoardTitle, field: CreditsField): string[] {
	if (field === 'director') return title.manualDirector ?? [];
	if (field === 'cast') return title.manualCast ?? [];
	return title.manualStudio ?? [];
}

/**
 * What every surface renders, searches and exports: fetched first, user-added
 * after, deduped case-insensitively.
 */
export function getTitleCredits(title: HoardTitle, field: CreditsField): string[] {
	const fetched = getDisplayCredits(fetchedCredits(title, field));
	const merged = [...fetched];
	const seen = new Set(fetched.map((n) => n.toLowerCase()));
	for (const name of getManualCredits(title, field)) {
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(name);
	}
	return merged;
}

/** normalize a fetched list for storage: non-strings dropped, trimmed, capped; empty stays empty */
export function normalizeCreditsForStore(names: unknown): string[] {
	const cleaned = readStringList(names).map((n) => n.trim()).filter((n) => n !== '' && n !== 'N/A');
	return cleaned.slice(0, MAX_FETCHED_CREDITS);
}

/**
 * The API group to use for a title type. The three built-in types are hardcoded and
 * never live in the mapping; anything else routes via `settings.typeApiMapping`,
 * where a missing entry returns '' (no API configured).
 */
export function getApiGroupForType(
	type: string,
	mapping: Record<string, 'anime' | 'movie' | ''> | undefined,
): 'anime' | 'movie' | '' {
	if (type === 'Anime') return 'anime';
	if (type === 'Movie' || type === 'TV Show' || type === 'TvShow') return 'movie';
	return mapping?.[type] ?? '';
}

/** Poster URL to render (the note's `Cover`, else the fetched one). */
export function getDisplayPoster(title: HoardTitle): string {
	return title.posterUrl ?? '';
}
