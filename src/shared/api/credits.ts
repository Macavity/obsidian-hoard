import { readStringList } from '../domain/read';

/**
 * Cap on names stored from an API response. OMDb returns 4 actors; TMDB returns
 * the full cast (100+ on a big film). Fetched data only — user-added is uncapped.
 */
const MAX_FETCHED_CREDITS = 10;

/** normalize a fetched list for storage: non-strings dropped, trimmed, capped; empty stays empty */
export function normalizeCreditsForStore(names: unknown): string[] {
	const cleaned = readStringList(names).map((n) => n.trim()).filter((n) => n !== '' && n !== 'N/A');
	return cleaned.slice(0, MAX_FETCHED_CREDITS);
}
