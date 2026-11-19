import { describe, expect, it } from 'vitest';
import {
	passesCommonFilters,
	type CommonFilterCriteria,
	type CommonFilterable,
} from '../src/shared/domain/filterCriteria';

const item = (over: Partial<CommonFilterable> = {}): CommonFilterable => ({
	favorite: false, type: 'Movie', status: 'Watching', rating: 4.5, priority: '', releaseDate: null, ...over,
});

const criteria = (over: Partial<CommonFilterCriteria> = {}): CommonFilterCriteria => ({
	favoritesOnly: false, recentlyArrivedOnly: false, ratingEmptyOnly: false,
	typeExclude: new Set(), statusExclude: new Set(), ratingExclude: new Set(), priorityExclude: new Set(),
	...over,
});

function isoDaysAgo(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

describe('passesCommonFilters', () => {
	it('passes with empty criteria', () => {
		expect(passesCommonFilters(item(), criteria())).toBe(true);
	});

	it('favoritesOnly drops non-favorites and keeps favorites', () => {
		expect(passesCommonFilters(item(), criteria({ favoritesOnly: true }))).toBe(false);
		expect(passesCommonFilters(item({ favorite: true }), criteria({ favoritesOnly: true }))).toBe(true);
	});

	it('typeExclude drops an excluded type', () => {
		expect(passesCommonFilters(item(), criteria({ typeExclude: new Set(['Movie']) }))).toBe(false);
		expect(passesCommonFilters(item(), criteria({ typeExclude: new Set(['Show']) }))).toBe(true);
	});

	it('statusExclude drops an excluded status', () => {
		expect(passesCommonFilters(item(), criteria({ statusExclude: new Set(['Watching']) }))).toBe(false);
	});

	it('recentlyArrivedOnly replaces the status filter', () => {
		const c = criteria({ recentlyArrivedOnly: true, statusExclude: new Set(['Watching']) });
		expect(passesCommonFilters(item({ releaseDate: isoDaysAgo(1) }), c)).toBe(true);
		expect(passesCommonFilters(item({ releaseDate: isoDaysAgo(30) }), c)).toBe(false);
		expect(passesCommonFilters(item({ releaseDate: null }), c)).toBe(false);
	});

	it('ratingExclude drops an excluded star value', () => {
		expect(passesCommonFilters(item(), criteria({ ratingExclude: new Set(['4.5★']) }))).toBe(false);
		expect(passesCommonFilters(item(), criteria({ ratingExclude: new Set(['3★']) }))).toBe(true);
	});

	it('ratingExclude always drops un-rated items', () => {
		expect(passesCommonFilters(item({ rating: 0 }), criteria({ ratingExclude: new Set(['3★']) }))).toBe(false);
	});

	it('ratingEmptyOnly keeps only un-rated items and replaces the rating filter', () => {
		expect(passesCommonFilters(item(), criteria({ ratingEmptyOnly: true }))).toBe(false);
		const c = criteria({ ratingEmptyOnly: true, ratingExclude: new Set(['3★']) });
		expect(passesCommonFilters(item({ rating: 0 }), c)).toBe(true);
	});

	it("treats '' as a real priority", () => {
		expect(passesCommonFilters(item(), criteria({ priorityExclude: new Set(['']) }))).toBe(false);
		expect(passesCommonFilters(item({ priority: 'High' }), criteria({ priorityExclude: new Set(['']) }))).toBe(true);
	});
});
