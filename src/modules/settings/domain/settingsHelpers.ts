import type { HoardTitle } from '../../watchlist/contract';
import { isCreditsUnfetched } from '../../../shared/domain/titles';

/** studio still needs its one-time fetch (separate — anime has studios but no credits) */
export function needsStudioFetch(title: HoardTitle): boolean {
	return isCreditsUnfetched(title.studio);
}
