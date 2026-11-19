import type { HoardTitle } from './model';
import { getDisplayCredits } from './titles';

export const COLLECTION_NONE = 0;

/** already checked, nothing there — never re-query */
export function isCollectionNone(title: HoardTitle): boolean {
	return title.collectionId === COLLECTION_NONE;
}

export function getCollectionId(title: HoardTitle): number | null {
	const id = title.collectionId;
	return id !== undefined && id !== COLLECTION_NONE ? id : null;
}

/** names shown inline before the rest collapse behind "+N more" */
export const CREDITS_INLINE_LIMIT = 4;

/** names shown inline on the studio line before the rest collapse behind "+N more" */
export const STUDIO_INLINE_LIMIT = 3;

/**
 * Drops manual entries a fetch has since returned, so a refresh folds them in
 * instead of leaving a duplicate in data.json.
 */
export function pruneManualCredits(manual: string[], fetched: string[]): string[] {
	const seen = new Set(getDisplayCredits(fetched).map((n) => n.toLowerCase()));
	return manual.filter((n) => !seen.has(n.toLowerCase()));
}

/** trims + de-dupes user-typed names; uncapped, unlike fetched credits */
export function normalizeManualCredits(names: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of names) {
		const name = raw.trim();
		if (name === '') continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
	}
	return out;
}

/** Community rating to render: each field of a note override wins over the cached API value. */
export function getCommunityRating(title: HoardTitle): {
	rating: number | undefined;
	votes: number | undefined;
	source: HoardTitle['communitySource'];
} {
	const o = title.overrides;
	return {
		rating: o?.communityRating ?? title.communityRating,
		votes: o?.communityVotes ?? title.communityVotes,
		source: o?.communitySource ?? title.communitySource,
	};
}

/**
 * Trailer URL to render — `manualTrailerUrl` wins; no trailer resolves to ''.
 */
export function getDisplayTrailer(title: HoardTitle): string {
	if (title.manualTrailerUrl && title.manualTrailerUrl.trim() !== '') {
		return title.manualTrailerUrl;
	}
	return title.trailerUrl ?? '';
}

export function formatVoteCount(votes: number): string {
	if (!votes || votes < 0) return '0';
	if (votes >= 1_000_000) return (votes / 1_000_000).toFixed(1) + 'M';
	if (votes >= 1_000) return (votes / 1_000).toFixed(1) + 'K';
	return votes.toString();
}
