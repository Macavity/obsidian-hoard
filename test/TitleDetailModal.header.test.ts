import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice, Platform } from 'obsidian';
import { TitleDetailModal } from '../src/TitleDetailModal';
import { DEFAULT_SETTINGS, type HoardTitle } from '../src/types';
import { t } from '../src/i18n';

const shown = (Notice as unknown as { shown: string[] }).shown;

vi.mock('../src/NoteLinkButton', () => ({
	appendNoteLinkButton: (_app: unknown, parent: HTMLElement) => parent.createSpan({ cls: 'note-link-stub' }),
}));
vi.mock('../src/CommunityRating', () => ({
	renderCommunityRating: vi.fn(),
	maybeAutoRefreshCommunityRating: vi.fn(),
}));

const mkTitle = (over: Partial<HoardTitle> = {}): HoardTitle => (({
	id: 't1', title: 'Alien', type: 'Movie', status: 'Plan to Watch', priority: '', review: '', rating: 0, notes: '',
	dateStarted: null, dateFinished: null, dateAdded: '', dateModified: '', totalEpisodes: 1, episodeDuration: 100,
	releaseDate: null, externalLink: '', seasons: [], watchedEpisodes: [],
	director: ['none'], cast: ['none'], studio: ['none'],
	...over,
}));

function build(title: HoardTitle, o: { mobile?: boolean; trailer?: string | Error; stored?: HoardTitle | null; onPerson?: boolean; tmdbKey?: boolean } = {}) {
	const stored = o.stored === undefined ? title : o.stored;
	const dataManager = {
		getCollapsedSeasonsForTitle: () => new Set<number>(),
		getTitle: vi.fn(() => stored),
		getNoteFilePath: () => 'Hoard/Alien.md',
		calcTimeRemainingForModal: () => 90,
		calcTimeWatched: () => 10,
		getEffectiveTotal: () => title.totalEpisodes,
		getProgress: () => 40,
		updateTrailerUrl: vi.fn((_id: string, url: string) => { if (stored) stored.trailerUrl = url; }),
		persistCollapsedSeasons: vi.fn(() => Promise.resolve()),
		updatePosterUrl: vi.fn(),
	};
	const apiService = {
		fetchTrailer: vi.fn(() => (o.trailer instanceof Error ? Promise.reject(o.trailer) : Promise.resolve(o.trailer ?? ''))),
		fetchCredits: vi.fn(() => Promise.resolve(null)),
		fetchStudio: vi.fn(() => Promise.resolve(null)),
		hasTmdbKey: vi.fn(() => o.tmdbKey ?? true),
		hasOmdbKey: vi.fn(() => false),
	};
	const plugin = {
		settings: { ...DEFAULT_SETTINGS, seasonPalette: ['#111', '#222'] },
		dataManager,
		apiService,
		posterService: undefined,
	};
	(Platform as { isMobile: boolean }).isMobile = o.mobile ?? false;
	const modal = new TitleDetailModal({} as never, plugin as never, title, undefined, o.onPerson ? () => {} : undefined);
	const x = modal as unknown as {
		headerEl: HTMLElement | null;
		contentEl: HTMLElement;
		mobile: boolean;
		renderHeaderBody: () => void;
		refreshTrailer: (btn: HTMLElement, container: HTMLElement) => Promise<void>;
		renderRatingSection: (p: HTMLElement) => void;
		renderEpisodesSection: (p: HTMLElement) => void;
		collapsedSeasons: Set<number>;
	};
	return { modal: x, dataManager, apiService, plugin };
}

function header(m: ReturnType<typeof build>['modal']): HTMLElement {
	m.mobile = (Platform as { isMobile: boolean }).isMobile;
	m.headerEl = document.createElement('div');
	m.contentEl.appendChild(m.headerEl);
	m.renderHeaderBody();
	return m.headerEl;
}

beforeEach(() => { shown.length = 0; });
afterEach(() => { (Platform as { isMobile: boolean }).isMobile = false; vi.clearAllMocks(); });

describe('TitleDetailModal.renderHeaderBody', () => {
	it('renders the desktop header with title, studio line, badges, stats box and note button', () => {
		const { modal } = build(mkTitle({ externalLink: 'https://imdb.com/title/tt1' }));
		const h = header(modal);
		expect(h.querySelector('.hoard-detail__header-top')).toBeNull();
		expect(h.querySelector('.hoard-detail__title')!.textContent).toBe('Alien');
		expect(h.querySelector('.hoard-detail__studio')).not.toBeNull();
		expect(h.querySelectorAll('.hoard-reading-detail__status-wrap')).toHaveLength(3);
		const link = h.querySelector('a.hoard-accordion__link-icon') as HTMLAnchorElement;
		expect(link.textContent).toBe('');
		expect(link.getAttribute('data-icon')).toBe('globe');
		expect(link.getAttribute('href')).toBe('https://imdb.com/title/tt1');
		expect(link.rel).toBe('noopener noreferrer');
		expect(link.getAttribute('aria-label')).toBe(t('list.openExternalLink'));
		expect(link.getAttribute('data-tooltip')).toBe(t('list.openExternalLink'));
		expect(link.hasAttribute('title')).toBe(false);
		expect(h.querySelector('.hoard-detail__stats-box--bar')).not.toBeNull();
		expect(h.querySelector('.note-link-stub')).not.toBeNull();
		// desktop: refresh button lives in the credits block, built from the shared icon button
		const refresh = h.querySelector('.hoard-detail__credits .hoard-credits__refresh')!;
		expect(refresh.classList.contains('hoard-icon-btn')).toBe(true);
		expect(refresh.getAttribute('data-icon')).toBe('refresh-cw');
	});

	it('omits the link icon without an external link', () => {
		const { modal } = build(mkTitle());
		expect(header(modal).querySelector('a.hoard-accordion__link-icon')).toBeNull();
	});

	it('renders the mobile header with a top row, rating section and refresh in the badge row', () => {
		const { modal } = build(mkTitle({ externalLink: 'https://x.test' }), { mobile: true });
		const h = header(modal);
		expect(h.querySelector('.hoard-detail__header-top')).not.toBeNull();
		expect(h.querySelector('.hoard-detail__header-top .hoard-detail__rating')).not.toBeNull();
		expect(h.querySelector('.hoard-detail__studio')).toBeNull();
		expect(h.querySelector('.hoard-detail__stats-line')).not.toBeNull();
		expect(h.querySelector('.hoard-detail__badge-row .hoard-credits__refresh')).not.toBeNull();
		expect(h.querySelector('a.hoard-accordion__link-icon')!.textContent).toBe('');
	});

	it('does nothing without a header element', () => {
		const { modal } = build(mkTitle());
		modal.headerEl = null;
		expect(() => modal.renderHeaderBody()).not.toThrow();
	});

	it('kicks off the credits and studio backfill for titles that predate the fields', async () => {
		const { modal, apiService } = build(mkTitle({ id: 'backfill', director: undefined, cast: undefined, studio: undefined }));
		header(modal);
		await Promise.resolve();
		expect(apiService.fetchCredits).toHaveBeenCalledTimes(1);
		expect(apiService.fetchStudio).toHaveBeenCalledTimes(1);
	});
});

describe('TitleDetailModal backfill without a key', () => {
	const flushAll = () => new Promise<void>((r) => setTimeout(r, 0));

	it('does not store none for credits when the fetch fails', async () => {
		const { modal, apiService, dataManager } = build(mkTitle({ id: 'cred-fail', director: undefined, cast: undefined }));
		(dataManager as unknown as Record<string, unknown>).updateCredits = vi.fn();
		apiService.fetchCredits.mockRejectedValueOnce(new Error('net'));
		header(modal);
		await flushAll();
		expect((dataManager as unknown as { updateCredits: unknown }).updateCredits).not.toHaveBeenCalled();
	});

	it('does not store none for a movie studio without a TMDB key', async () => {
		const { modal, apiService, dataManager } = build(mkTitle({ id: 'studio-nokey', studio: undefined }), { tmdbKey: false });
		(dataManager as unknown as Record<string, unknown>).updateStudio = vi.fn();
		header(modal);
		await flushAll();
		expect(apiService.fetchStudio).not.toHaveBeenCalled();
		expect((dataManager as unknown as { updateStudio: unknown }).updateStudio).not.toHaveBeenCalled();
	});
});

describe('TitleDetailModal.refreshTrailer', () => {
	const els = () => ({ btn: document.createElement('button'), container: document.createElement('span') });

	it('does nothing when the title vanished', async () => {
		const { modal, apiService } = build(mkTitle(), { stored: null });
		const { btn, container } = els();
		await modal.refreshTrailer(btn, container);
		expect(apiService.fetchTrailer).not.toHaveBeenCalled();
		expect(btn.classList.contains('is-loading')).toBe(false);
	});

	it('ignores a second trigger while a fetch is in flight', async () => {
		const { modal, apiService } = build(mkTitle(), { trailer: 'https://youtu.be/x' });
		const { btn, container } = els();
		btn.classList.add('is-loading');
		await modal.refreshTrailer(btn, container);
		expect(apiService.fetchTrailer).not.toHaveBeenCalled();
	});

	it('stores a found trailer and repaints the control with a play button', async () => {
		const { modal, dataManager } = build(mkTitle(), { trailer: 'https://youtu.be/x' });
		const { btn, container } = els();
		await modal.refreshTrailer(btn, container);
		expect(dataManager.updateTrailerUrl).toHaveBeenCalledWith('t1', 'https://youtu.be/x');
		const play = container.querySelector('button.hoard-trailer-btn')!;
		expect(play.classList.contains('hoard-trailer-btn--fetch')).toBe(false);
		expect(play.getAttribute('data-icon')).toBe('play');
		expect(shown).toEqual([]);
	});

	it('marks a missing trailer as none and keeps the refresh button', async () => {
		for (const trailer of ['', 'none']) {
			const { modal, dataManager } = build(mkTitle(), { trailer });
			const { btn, container } = els();
			await modal.refreshTrailer(btn, container);
			expect(dataManager.updateTrailerUrl).toHaveBeenCalledWith('t1', 'none');
			expect(btn.classList.contains('is-loading')).toBe(false);
			expect(shown.at(-1)).toBe(t('detail.trailer.notFound'));
		}
	});

	it('reports a failing fetch the same way', async () => {
		const { modal, dataManager } = build(mkTitle(), { trailer: new Error('boom') });
		const { btn, container } = els();
		await modal.refreshTrailer(btn, container);
		expect(dataManager.updateTrailerUrl).not.toHaveBeenCalled();
		expect(btn.classList.contains('is-loading')).toBe(false);
		expect(shown).toEqual([t('detail.trailer.notFound')]);
	});
});

describe('TitleDetailModal seasons', () => {
	const seasoned = () => mkTitle({
		type: 'TV',
		totalEpisodes: 4,
		seasons: [
			{ name: 'S1', episodes: 2, offset: 0, skippedEpisodes: [2] },
			{ name: 'S2', episodes: 2, offset: 2 },
		] as never,
	});

	function render(title: HoardTitle) {
		const b = build(title);
		const parent = document.createElement('div');
		b.modal.renderEpisodesSection(parent);
		return { ...b, parent };
	}

	it('renders a header per season with episode and skip counts and a grid per open season', () => {
		const { parent } = render(seasoned());
		const counts = Array.from(parent.querySelectorAll('.hoard-accordion__season-episode-count')).map((e) => e.textContent);
		expect(counts).toEqual([t('list.season.epsToSkip', { eps: 2, skip: 1 }), t('list.season.eps', { count: 2 })]);
		expect((parent.querySelector('.hoard-accordion__season-badge') as HTMLElement).style.getPropertyValue('--hoard-accordion-season-color')).not.toBe('');
		expect(parent.querySelectorAll('.hoard-accordion__episode-grid')).toHaveLength(2);
	});

	it('collapses and re-expands a season, persisting the state', () => {
		const { parent, dataManager, modal } = render(seasoned());
		const header0 = parent.querySelector('.hoard-accordion__season-header') as HTMLElement;
		header0.click();
		expect(modal.collapsedSeasons.has(0)).toBe(true);
		expect(parent.querySelectorAll('.hoard-accordion__episode-grid')).toHaveLength(1);
		expect(header0.querySelector('.hoard-chevron')!.classList.contains('is-open')).toBe(false);
		header0.click();
		expect(modal.collapsedSeasons.has(0)).toBe(false);
		expect(parent.querySelectorAll('.hoard-accordion__episode-grid')).toHaveLength(2);
		expect(header0.querySelector('.hoard-chevron')!.classList.contains('is-open')).toBe(true);
		expect(dataManager.persistCollapsedSeasons).toHaveBeenCalledTimes(2);
	});

	it('starts collapsed seasons without a grid', () => {
		const b = build(seasoned());
		b.modal.collapsedSeasons.add(1);
		const parent = document.createElement('div');
		b.modal.renderEpisodesSection(parent);
		expect(parent.querySelectorAll('.hoard-accordion__episode-grid')).toHaveLength(1);
		expect(parent.querySelectorAll('.hoard-chevron.is-open')).toHaveLength(1);
	});

	it('renders one grid for a seasonless series with episodes and nothing without', () => {
		const withEps = render(mkTitle({ type: 'TV', totalEpisodes: 3 }));
		expect(withEps.parent.querySelectorAll('.hoard-accordion__episode-box')).toHaveLength(3);
		const none = render(mkTitle({ type: 'TV', totalEpisodes: 0 }));
		expect(none.parent.querySelector('.hoard-accordion__episode-grid')).toBeNull();
	});

	it('shows the mark-as-watched button for a movie', () => {
		const { parent } = render(mkTitle());
		expect(parent.querySelector('.hoard-accordion__mark-watched-btn')).not.toBeNull();
	});
});

describe('TitleDetailModal trailer control', () => {
	function ratingRow(title: HoardTitle, mobile = false) {
		const built = build(title, { mobile });
		built.modal.mobile = mobile;
		const parent = document.createElement('div');
		built.modal.renderRatingSection(parent);
		return { ...built, row: parent };
	}

	it('shows one muted play button that fetches when no trailer is known', () => {
		const { row, apiService } = ratingRow(mkTitle({ trailerUrl: 'none' }));
		const btns = row.querySelectorAll('.hoard-trailer-btn__control button');
		expect(btns).toHaveLength(1);
		const btn = btns[0] as HTMLButtonElement;
		expect(btn.classList.contains('hoard-trailer-btn--fetch')).toBe(true);
		expect(btn.getAttribute('data-icon')).toBe('play');
		expect(btn.getAttribute('aria-label')).toBe(t('detail.trailer.fetch'));
		expect(btn.hasAttribute('title')).toBe(false);
		expect(row.querySelector('.hoard-trailer-refresh, [data-icon="refresh-cw"]')).toBeNull();
		btn.click();
		expect(apiService.fetchTrailer).toHaveBeenCalledTimes(1);
	});

	it('shows the same play button, unmuted, when a trailer is known', () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const { row, apiService } = ratingRow(mkTitle({ trailerUrl: 'https://youtu.be/x' }));
		const btn = row.querySelector('.hoard-trailer-btn__control button') as HTMLButtonElement;
		expect(btn.classList.contains('hoard-trailer-btn--fetch')).toBe(false);
		expect(btn.getAttribute('data-icon')).toBe('play');
		expect(btn.getAttribute('aria-label')).toBe(t('detail.trailer.watch'));
		btn.click();
		expect(open).toHaveBeenCalledWith('https://youtu.be/x', '_blank');
		expect(apiService.fetchTrailer).not.toHaveBeenCalled();
		open.mockRestore();
	});

	it('labels the button on mobile', () => {
		const { row } = ratingRow(mkTitle({ trailerUrl: 'https://youtu.be/x' }), true);
		const btn = row.querySelector('.hoard-trailer-btn__control button')!;
		expect(btn.classList.contains('hoard-trailer-btn--labeled')).toBe(true);
		expect(btn.querySelector('.hoard-trailer-btn__label')!.textContent).toBe(t('detail.trailer.label'));
	});
});
