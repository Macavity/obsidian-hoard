import { describe, expect, it } from 'vitest';
import { newDraftsTab } from '../helpers/newDraftsTab';
import { qsa } from '../helpers/dom';
import { fakeSettings } from '../helpers/fakeSettings';

interface Entry {
	titleKey: string;
	titleDisplay: string;
	sources: string[];
	firstSeen: string;
	added: boolean;
}

const draft = (name: string, added = false): Entry => ({
	titleKey: name.toLowerCase(), titleDisplay: name, sources: ['Note'], firstSeen: '2026-01-01', added,
});

function render(entries: Entry[]): { root: HTMLElement; counts: number[] } {
	const counts: number[] = [];
	const parts = {
		settings: fakeSettings({ showHintBanners: false, draftsVaultTag: '#hoard' }),
		titles: { getTitles: () => [{ title: 'Breaking Bad' }] },
		reading: {
			getBooks: () => [{ title: 'Dune' }],
			getMangaList: () => [{ title: 'Berserk' }],
		},
		games: { getGames: () => [{ title: 'Hades' }] },
	};
	const root = document.createElement('div');
	const tab = newDraftsTab(root, parts, (n) => counts.push(n));
	(tab as unknown as { renderUI: (e: Entry[]) => void }).renderUI(entries);
	return { root, counts };
}

describe('DraftsTab duplicate labels', () => {
	it('names the library that already holds a draft', () => {
		const { root } = render([draft('Breaking Bad'), draft('Dune'), draft('Berserk'), draft('Hades')]);
		const dups = qsa(root, '.hoard-drafts__card-duplicate').map((d) => d.textContent);
		expect(dups.sort()).toEqual(['In Books', 'In Games', 'In Manga', 'In Watchlist']);
		const watchlist = qsa(root, '.hoard-drafts__card-duplicate span').find((s) => s.textContent === 'In Watchlist')!;
		expect(watchlist.getAttribute('title')).toBe('This title already exists in your Watchlist');
		const games = qsa(root, '.hoard-drafts__card-duplicate span').find((s) => s.textContent === 'In Games')!;
		expect(games.getAttribute('title')).toBe('This title already exists in your Games library');
	});

	it('counts only new drafts as pending and offers Add just for them', () => {
		const { root, counts } = render([draft('Hades'), draft('Totally New'), draft('Marked', true)]);
		expect(counts).toEqual([1]);
		expect(qsa(root, '.hoard-drafts__card')).toHaveLength(3);
		expect(qsa(root, 'button.hoard-btn--primary')).toHaveLength(1);
		expect(qsa(root, '.hoard-drafts__added-label')).toHaveLength(2);
		// already-present drafts sort last
		const titles = qsa(root, '.hoard-drafts__card-title').map((e) => e.textContent);
		expect(titles[titles.length - 1]).toBe('Hades');
	});
});
