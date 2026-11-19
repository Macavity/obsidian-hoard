import { passesCommonFilters, type CommonFilterCriteria } from '../../../shared/domain/filterCriteria';
import type { Game } from './model';

export interface GameFilterCriteria extends CommonFilterCriteria {
	wishlistOnly: boolean;
	platformExclude: ReadonlySet<string>;
}

export function gamePassesFilters(g: Game, c: GameFilterCriteria): boolean {
	if (c.wishlistOnly && !g.wishlist) return false;
	if (!passesCommonFilters(g, c)) return false;
	// a game hides only when EVERY one of its platforms is excluded; games with none set are
	// unaffected (the Group rule)
	if (g.platforms.length > 0 && g.platforms.every((p) => c.platformExclude.has(p))) return false;
	return true;
}
