import { describe, expect, it, vi } from 'vitest';
import { CollectionModal } from '../src/modules/watchlist/ui/CollectionModal';
import { DEFAULT_SETTINGS, type HoardTitle, type TmdbCollectionDetail } from '../src/shared/domain/types';
import { t } from '../src/shared/i18n';
import { fakeSettings } from './helpers/fakeSettings';

const collection: TmdbCollectionDetail = {
	id: 99,
	name: 'Dune Collection',
	parts: [
		{ id: 1, title: 'Dune', release_date: '2021-10-22', poster_path: '/dune.jpg' },
		{ id: 2, title: 'Dune: Part Two', release_date: '2024-03-01' },
		{ id: 3, title: 'Dune: Part Three', release_date: '2026-12-18' },
	],
};

const owned = (over: Partial<HoardTitle>): HoardTitle => ({
	id: 'Movie/Dune', title: 'Dune', type: 'Movie', status: 'Watching', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 4, episodeDuration: 155,
	releaseDate: '2021-10-22', externalLink: '', seasons: [], watchedEpisodes: [1], ...over,
});

function open(existing: HoardTitle[]) {
	const onOpenTitle = vi.fn();
	const deps = {
		app: {} as never,
		settings: fakeSettings({ ...DEFAULT_SETTINGS }),
		titles: { getTitles: () => existing, getEffectiveTotal: (t: HoardTitle) => t.totalEpisodes },
		api: {},
	};
	const modal = new CollectionModal(deps as never, collection, 'Movie', onOpenTitle);
	modal.open();
	const cards = (): HTMLElement[] => Array.from(modal.contentEl.querySelectorAll<HTMLElement>('.hoard-card'));
	const footerBtns = (): HTMLButtonElement[] => Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('.hoard-collection__footer button'));
	return { modal, onOpenTitle, cards, footerBtns };
}

describe('CollectionModal rendering', () => {
	it('shows the library count and one card per collection part, oldest first', () => {
		const { modal, cards } = open([owned({})]);
		expect(modal.contentEl.querySelector('.hoard-collection__meta')!.textContent).toBe('1 of 3 in your library');
		expect(cards()).toHaveLength(3);
		expect(cards()[0]!.dataset.titleId).toBe('Movie/Dune');
		expect(cards()[1]!.classList.contains('hoard-card--missing')).toBe(true);
	});

	it('opens an owned title from its card and closes itself', () => {
		const { modal, onOpenTitle, cards } = open([owned({})]);
		const close = vi.spyOn(modal, 'close');
		cards()[0]!.click();
		expect(close).toHaveBeenCalledOnce();
		expect(onOpenTitle).toHaveBeenCalledWith(expect.objectContaining({ id: 'Movie/Dune' }));
	});

	it('treats a Completed title as fully watched and an unknown type as not coloured', () => {
		const { cards } = open([owned({ status: 'Completed', type: 'Documentary' })]);
		const fill = cards()[0]!.querySelector<HTMLElement>('.hoard-card__progress-fill');
		expect(fill?.style.getPropertyValue('--hoard-card-progress-width') ?? '').toMatch(/100/);
	});

	it('selects a missing part by clicking its card and counts the selection in the footer', () => {
		const { cards, footerBtns } = open([owned({})]);
		cards()[1]!.click();
		expect(cards()[1]!.classList.contains('hoard-card--selected')).toBe(true);
		expect(footerBtns().at(-1)!.textContent).toBe(t('misc.collection.addCount', { count: 1 }));
		expect(footerBtns().at(-1)!.disabled).toBe(false);
	});

	it('selects every missing part, then none', () => {
		const { footerBtns, cards } = open([owned({})]);
		const selected = (): number => cards().filter((c) => c.classList.contains('hoard-card--selected')).length;
		footerBtns()[0]!.click();
		expect(selected()).toBe(2);
		expect(footerBtns().at(-1)!.textContent).toBe(t('misc.collection.addCount', { count: 2 }));
		footerBtns()[0]!.click();
		expect(selected()).toBe(0);
		expect(footerBtns().at(-1)!.disabled).toBe(true);
	});

	it('offers no selection when every part is already in the library', () => {
		const all = [
			owned({}),
			owned({ id: 'Movie/Dune2', title: 'Dune: Part Two', releaseDate: '2024-03-01' }),
			owned({ id: 'Movie/Dune3', title: 'Dune: Part Three', releaseDate: '2026-12-18' }),
		];
		const { footerBtns } = open(all);
		expect(footerBtns().map((b) => b.textContent)).not.toContain('Select all');
	});
});
