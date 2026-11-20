import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice as RealNotice } from 'obsidian';
import { refreshCommunityRating, renderCommunityRating } from '../src/modules/watchlist/ui/CommunityRating';
import { makeTitle } from './helpers/setupDataManager';
import { fakeSettings } from './helpers/fakeSettings';
import type { AnimeSearchResult, HoardTitle } from '../src/modules/watchlist/domain/model';

const Notice = RealNotice as unknown as { shown: string[] };

function setup(title: HoardTitle | undefined, settings: object = {}) {
	const titles = {
		getTitle: vi.fn(() => title),
		updateTitle: vi.fn((_t: HoardTitle) => Promise.resolve()),
		updateCommunityRating: vi.fn(),
	};
	const api = {
		fetchCommunityRating: vi.fn(() => Promise.resolve({ rating: 8, votes: 100, source: 'mal' } as never)),
		searchAniList: vi.fn(() => Promise.resolve([] as AnimeSearchResult[])),
		searchAnime: vi.fn(() => Promise.resolve([] as AnimeSearchResult[])),
	};
	return { titles, api, settings: fakeSettings(settings) };
}

const hit = (title: string, ids: Partial<AnimeSearchResult> = {}): AnimeSearchResult =>
	({ title, malId: 11, anilistId: 22, ...ids }) as AnimeSearchResult;

function run(s: ReturnType<typeof setup>, notice = true, btn: HTMLElement | null = null) {
	return refreshCommunityRating(s.titles, s.settings as never, s.api, 'a', btn, notice);
}

describe('refreshCommunityRating', () => {
	beforeEach(() => { Notice.shown.length = 0; });

	it('returns false for an unknown title', async () => {
		expect(await run(setup(undefined))).toBe(false);
	});

	it('notices when the type has no API', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Book' }));
		expect(await run(s)).toBe(false);
		expect(Notice.shown).toHaveLength(1);
		expect(s.api.fetchCommunityRating).not.toHaveBeenCalled();
	});

	it('stays silent without showNotice', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Book' }));
		expect(await run(s, false)).toBe(false);
		expect(Notice.shown).toHaveLength(0);
	});

	it('fetches and stores a movie rating, toggling the loading class', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		const btn = document.createElement('button');
		const p = run(s, true, btn);
		expect(btn.classList.contains('is-loading')).toBe(true);
		expect(await p).toBe(true);
		expect(btn.classList.contains('is-loading')).toBe(false);
		expect(s.titles.updateCommunityRating).toHaveBeenCalledWith('a', 8, 100, 'mal');
		expect(Notice.shown).toHaveLength(1);
	});

	it('does not notice a successful fetch when silent', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		expect(await run(s, false)).toBe(true);
		expect(Notice.shown).toHaveLength(0);
	});

	it('reports a failed fetch', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		s.api.fetchCommunityRating.mockResolvedValue(null as never);
		expect(await run(s)).toBe(false);
		expect(s.titles.updateCommunityRating).not.toHaveBeenCalled();
		expect(Notice.shown).toHaveLength(1);
	});

	it('fails silently on a failed fetch without showNotice', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		s.api.fetchCommunityRating.mockResolvedValue(null as never);
		expect(await run(s, false)).toBe(false);
		expect(Notice.shown).toHaveLength(0);
	});

	it('turns a thrown error into a notice', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		s.api.fetchCommunityRating.mockRejectedValue(new Error('boom'));
		expect(await run(s)).toBe(false);
		expect(Notice.shown).toHaveLength(1);
	});

	it('swallows a thrown error without showNotice', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		s.api.fetchCommunityRating.mockRejectedValue(new Error('boom'));
		expect(await run(s, false)).toBe(false);
		expect(Notice.shown).toHaveLength(0);
	});

	describe('anime without the preferred id', () => {
		it('searches MAL by name, stores the id and link, then fetches', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto' }), { animeApiSource: 'jikan' });
			s.api.searchAnime.mockResolvedValue([hit('Naruto')]);
			expect(await run(s)).toBe(true);
			expect(s.api.searchAniList).not.toHaveBeenCalled();
			const saved = s.titles.updateTitle.mock.calls[0]![0];
			expect(saved.malId).toBe(11);
			expect(saved.externalLink).toBe('https://myanimelist.net/anime/11');
		});

		it('searches AniList when preferred', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto' }), { animeApiSource: 'anilist' });
			s.api.searchAniList.mockResolvedValue([hit('Naruto')]);
			expect(await run(s)).toBe(true);
			const saved = s.titles.updateTitle.mock.calls[0]![0];
			expect(saved.anilistId).toBe(22);
			expect(saved.externalLink).toBe('https://anilist.co/anime/22');
		});

		it('notices when nothing matches', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto' }), { animeApiSource: 'anilist' });
			s.api.searchAniList.mockResolvedValue([hit('Completely different')]);
			expect(await run(s)).toBe(false);
			expect(Notice.shown).toHaveLength(1);
			expect(s.titles.updateTitle).not.toHaveBeenCalled();
		});

		it('is silent when nothing matches without showNotice', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto' }));
			expect(await run(s, false)).toBe(false);
			expect(Notice.shown).toHaveLength(0);
		});

		it('returns false when the title vanished after the search', async () => {
			const title = makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto' });
			const s = setup(title);
			s.api.searchAnime.mockResolvedValue([hit('Naruto')]);
			s.titles.getTitle.mockReturnValueOnce(title).mockReturnValueOnce(undefined);
			expect(await run(s)).toBe(false);
		});

		it('picks a later result when the first is unrelated', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Naruto Shippuden' }));
			s.api.searchAnime.mockResolvedValue([hit('Bleach', { malId: 1 }), hit('Naruto Shippuden', { malId: 2 })]);
			expect(await run(s)).toBe(true);
			expect((s.titles.updateTitle.mock.calls[0]![0]).malId).toBe(2);
		});

		it('matches by shared words', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Attack on Titan Season' }));
			s.api.searchAnime.mockResolvedValue([hit('Titan Attack Final')]);
			expect(await run(s)).toBe(true);
		});

		it('rejects matches without usable words', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: '!!' }));
			s.api.searchAnime.mockResolvedValue([hit('??')]);
			expect(await run(s)).toBe(false);
		});

		it('rejects short-word-only names', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', title: 'Ab Cd' }));
			s.api.searchAnime.mockResolvedValue([hit('Ef Gh')]);
			expect(await run(s)).toBe(false);
		});
	});

	describe('anime with the preferred id', () => {
		it('corrects a mismatching externalLink', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', malId: 5, externalLink: 'x' }));
			expect(await run(s)).toBe(true);
			expect(s.titles.updateTitle).toHaveBeenCalledTimes(1);
			expect((s.titles.updateTitle.mock.calls[0]![0]).externalLink).toBe('https://myanimelist.net/anime/5');
		});

		it('uses the AniList link when preferred', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', anilistId: 7, externalLink: '' }), { animeApiSource: 'anilist' });
			expect(await run(s)).toBe(true);
			expect((s.titles.updateTitle.mock.calls[0]![0]).externalLink).toBe('https://anilist.co/anime/7');
		});

		it('leaves a matching externalLink alone', async () => {
			const s = setup(makeTitle({ id: 'a', type: 'Anime', sourceType: 'Anime', malId: 5, externalLink: 'https://myanimelist.net/anime/5' }));
			expect(await run(s)).toBe(true);
			expect(s.titles.updateTitle).not.toHaveBeenCalled();
		});
	});
});

describe('renderCommunityRating refresh button', () => {
	it('refreshes on click and calls onUpdated', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		const parent = document.createElement('div');
		const onUpdated = vi.fn();
		renderCommunityRating(parent, s.titles, s.settings as never, s.api, 'a', onUpdated);
		parent.querySelector('button')!.click();
		await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
		expect(s.api.fetchCommunityRating).toHaveBeenCalled();
	});

	it('refreshes on click without onUpdated', async () => {
		const s = setup(makeTitle({ id: 'a', type: 'Movie', sourceType: 'Movie' }));
		const parent = document.createElement('div');
		renderCommunityRating(parent, s.titles, s.settings as never, s.api, 'a');
		parent.querySelector('button')!.click();
		await vi.waitFor(() => expect(s.titles.updateCommunityRating).toHaveBeenCalled());
	});
});
