import type { HoardTitle } from '../../watchlist/exports';
import { isCreditsUnfetched } from '../../watchlist/exports';

/** studio still needs its one-time fetch (separate — anime has studios but no credits) */
export function needsStudioFetch(title: HoardTitle): boolean {
	return isCreditsUnfetched(title.studio);
}
