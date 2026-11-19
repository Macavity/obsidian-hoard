import { describe, expect, it } from 'vitest';
import {
	collectionAddNotice, collectionDefaults, existingPartCard, missingPartCard, NOT_ADDED_COLOR, uniqueId,
} from '../src/modules/watchlist/ui/collectionModel';
import { t } from '../src/shared/i18n';
import { DEFAULT_SETTINGS } from '../src/modules/settings/exports';
import type { HoardTitle, TmdbCollectionPart } from '../src/modules/watchlist/domain/model';

const settings = DEFAULT_SETTINGS;

const title = (over: Partial<HoardTitle>): HoardTitle => ({
	id: 'dune', title: 'Dune', type: 'Movie', status: 'Watching', watchedEpisodes: [], ...over,
}) as HoardTitle;

describe('uniqueId', () => {
	it('returns the base when free', () => expect(uniqueId('x', new Set(['y']))).toBe('x'));
	it('appends the first free counter', () => expect(uniqueId('x', new Set(['x', 'x-2']))).toBe('x-3'));
});

describe('collectionDefaults', () => {
	it('falls back to the first entries when shipped names are renamed', () => {
		expect(collectionDefaults({ statuses: [{ name: 'Backlog' }], priorities: [] } as never))
			.toEqual({ status: 'Backlog', priority: 'Medium' });
	});
	it('prefers the shipped names', () => {
		expect(collectionDefaults({
			statuses: [{ name: 'Backlog' }, { name: 'Plan to watch' }],
			priorities: [{ name: 'High' }, { name: 'Medium' }],
		} as never)).toEqual({ status: 'Plan to watch', priority: 'Medium' });
	});
});

describe('collectionAddNotice', () => {
	it('reports partial success', () =>
		expect(collectionAddNotice(2, 1, 'N')).toBe(t('misc.collection.partial', { added: 2, failed: 1 })));
	it('reports a total failure', () => expect(collectionAddNotice(0, 3, 'N')).toBe(t('misc.collection.fetchFailed')));
	it('reports success', () =>
		expect(collectionAddNotice(3, 0, 'N')).toBe(t('misc.collection.added', { count: 3, name: 'N' })));
});

describe('existingPartCard', () => {
	it('shows a full bar for Completed', () => {
		const card = existingPartCard(title({ status: 'Completed' }), settings, 12, 'fb', '2021');
		expect(card.progressRatio).toBe(1);
		expect(card.dataset).toEqual({ titleId: 'dune' });
	});
	it('computes watched / total', () => {
		const card = existingPartCard(title({ watchedEpisodes: [1, 2, 3] }), settings, 12, 'fb', '');
		expect(card.progressRatio).toBe(0.25);
		expect(card.year).toBeUndefined();
	});
	it('shows no bar for a zero total', () =>
		expect(existingPartCard(title({ watchedEpisodes: [1] }), settings, 0, 'fb', '').progressRatio).toBeUndefined());
});

describe('missingPartCard', () => {
	it('marks the part as not added', () => {
		const part = { id: 7, title: 'Dune' } as TmdbCollectionPart;
		const card = missingPartCard(part, true, 'Movie', 'fb', '2021');
		expect(card.selected).toBe(true);
		expect(card.statusColor).toBe(NOT_ADDED_COLOR);
		expect(card.dataset).toEqual({ partId: '7' });
		expect(card.typeLabel).toBe('Movie');
	});
});
