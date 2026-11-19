import { isRecentlyReleased } from './listOrder';

export interface CommonFilterCriteria {
	favoritesOnly: boolean;
	recentlyArrivedOnly: boolean;
	ratingEmptyOnly: boolean;
	typeExclude: ReadonlySet<string>;
	statusExclude: ReadonlySet<string>;
	ratingExclude: ReadonlySet<string>;
	priorityExclude: ReadonlySet<string>;
}

export interface CommonFilterable {
	favorite?: boolean;
	type: string;
	status: string;
	rating: number;
	priority: string;
	releaseDate: string | null;
}

function passesStatus(item: CommonFilterable, c: CommonFilterCriteria): boolean {
	// Recently arrived replaces the status filter
	if (c.recentlyArrivedOnly) return isRecentlyReleased(item.releaseDate);
	return !c.statusExclude.has(item.status);
}

function passesRating(item: CommonFilterable, c: CommonFilterCriteria): boolean {
	// rating 0 = un-rated, not a real value; only the Empty toggle shows those
	if (c.ratingEmptyOnly) return item.rating === 0;
	if (c.ratingExclude.size === 0) return true;
	return item.rating !== 0 && !c.ratingExclude.has(`${item.rating}★`);
}

export function passesCommonFilters(item: CommonFilterable, c: CommonFilterCriteria): boolean {
	if (c.favoritesOnly && !item.favorite) return false;
	if (c.typeExclude.has(item.type)) return false;
	if (!passesStatus(item, c)) return false;
	if (!passesRating(item, c)) return false;
	// '' is a real option — no-priority items are excludable like any other
	return !c.priorityExclude.has(item.priority);
}
