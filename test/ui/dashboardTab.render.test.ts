import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardTab } from '../../src/DashboardTab';
import type HoardPlugin from '../../src/main';
import type { DataManager } from '../../src/DataManager';
import type { ReadingDataManager } from '../../src/ReadingDataManager';
import type { Book, Game, HoardTitle, Manga } from '../../src/types';
import { DEFAULT_SETTINGS } from '../../src/types';
import { qsa, textsOf as texts } from '../helpers/dom';

const title = (over: Partial<HoardTitle>): HoardTitle =>
	({
		id: 'x', title: 'T', type: 'Anime', status: 'Completed', watchedEpisodes: [], totalEpisodes: 12,
		episodeDuration: 24, dateAdded: '2024-01-01', releaseDate: '2019-05-05', dateFinished: '2024-02-02', ...over,
	}) as unknown as HoardTitle;

interface Opts {
	titles?: HoardTitle[];
	books?: Book[];
	manga?: Manga[];
	games?: Game[];
	cardStyle?: 'rings' | 'rectangles';
}

function render(o: Opts = {}): HTMLElement {
	const settings = {
		...DEFAULT_SETTINGS,
		types: [{ name: 'Anime', color: '#f00' }, { name: 'Movie', color: '#0f0' }],
		dashboardCardStyle: o.cardStyle ?? 'rings',
	};
	const plugin = {
		settings,
		gameDataManager: { getGames: () => o.games ?? [] },
	} as unknown as HoardPlugin;
	const titles = o.titles ?? [];
	const dm = {
		getTitles: () => titles,
		getTotalTimeWatched: () => 120,
		getTotalTimeRemaining: () => 60,
		calcTimeWatched: () => 90,
		getRecentlyWatched: () => titles.slice(0, 3),
		getRecentlyAdded: () => titles.slice(0, 3),
		getNextUnwatchedEpisode: () => 2,
		getProgress: () => 40,
	} as unknown as DataManager;
	const rdm = {
		getBooks: () => o.books ?? [],
		getMangaList: () => o.manga ?? [],
	} as unknown as ReadingDataManager;
	const container = document.createElement('div');
	new DashboardTab(container, plugin, dm, rdm).render();
	return container;
}

beforeEach(() => {
	vi.stubGlobal('activeDocument', document);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('DashboardTab cards', () => {
	const titles = [
		title({ id: '1', status: 'Completed' }),
		title({ id: '2', status: 'Watching', type: 'Movie', watchedEpisodes: [1] }),
		title({ id: '3', status: 'Dropped' }),
	];
	const books = [{ id: 'b', status: 'Reading', title: 'B', pagesRead: 50, totalPages: 100, dateAdded: '2023-01-01' }] as unknown as Book[];
	const manga = [{
		id: 'm', status: 'Plan to Read', title: 'M', chaptersRead: 5, totalChapters: 10, volumesRead: 1, totalVolumes: 2,
	}] as unknown as Manga[];

	it('renders rings: unified card, type rings and reading rings', () => {
		const c = render({ titles, books, manga });
		expect(c.querySelector('.hoard-dash-unified')).not.toBeNull();
		expect(c.querySelector('.hoard-dash-unified-bordered')).toBeNull();
		expect(c.querySelectorAll('.hoard-ring-item').length).toBe(1 + 2 + 2);
		expect(c.querySelector('.hoard-dash-unified-4')).toBeNull();
		expect(texts(c, '.hoard-ring-label')).toEqual(expect.arrayContaining(['Anime', 'Movie']));
		expect(texts(c, '.hoard-ring-label').length).toBe(5);
	});

	it('renders rectangles with a bordered unified card and a bar width', () => {
		const c = render({ titles, books, manga, cardStyle: 'rectangles' });
		expect(c.querySelector('.hoard-dash-unified-bordered')).not.toBeNull();
		expect(c.querySelectorAll('.hoard-rect-item').length).toBe(2 + 2);
		const bars = qsa(c, '.hoard-rect-bar').map((b) => b.style.width);
		expect(bars).toContain('50%');
	});

	it('adds a fourth segment only when games have playtime', () => {
		const games = [{ id: 'g', status: 'Finished', type: 'RPG', playtimeMinutes: 90 }] as unknown as Game[];
		const withGames = render({ titles, games });
		expect(withGames.querySelector('.hoard-dash-unified-4')).not.toBeNull();
		expect(withGames.querySelectorAll('.hoard-dash-seg-time').length).toBe(3);
		expect(render({ titles }).querySelectorAll('.hoard-dash-seg-time').length).toBe(2);
	});

	it('shows 0% for empty libraries', () => {
		const c = render();
		expect(texts(c, '.hoard-ring-percent-text').every((x) => x === '0%')).toBe(true);
		const r = render({ cardStyle: 'rectangles' });
		expect(texts(r, '.hoard-rect-value').every((x) => x === '0%')).toBe(true);
	});
});

describe('DashboardTab suggestions and stats', () => {
	it('omits suggestions without plan-to-watch titles', () => {
		expect(render({ titles: [title({})] }).querySelector('.hoard-suggestions')).toBeNull();
	});

	it('picks the shortest plan title per type, falls back and reports empty types', () => {
		const c = render({
			titles: [
				title({ id: 'a', title: 'Long', status: 'Plan to watch', totalEpisodes: 100 }),
				title({ id: 'b', title: 'Short', status: 'Plan to watch', totalEpisodes: 2 }),
				title({ id: 'c', title: 'Unknown', status: 'Plan to watch', type: 'Movie', totalEpisodes: 0, episodeDuration: 0 }),
				title({ id: 'd', title: 'Runtime', status: 'Plan to watch', type: 'Movie', totalEpisodes: 0, episodeDuration: 90 }),
			],
		});
		const picks = texts(c, '.hoard-suggestion-title');
		expect(picks[0]).toBe('Short');
		expect(picks[1]).toBe('Runtime');
		expect(c.querySelectorAll('.hoard-suggestion-empty').length).toBe(1);
		c.querySelector<HTMLElement>('.hoard-suggestion-shuffle')!.click();
		const randomEl = c.querySelectorAll('.hoard-suggestion-title')[3]!;
		expect(['Long', 'Short', 'Unknown', 'Runtime']).toContain(randomEl.textContent);
	});

	it('falls back to any plan title when none has a length', () => {
		const c = render({
			titles: [title({ title: 'Only', status: 'Plan to watch', totalEpisodes: 0, episodeDuration: 0 })],
		});
		expect(texts(c, '.hoard-suggestion-title')[0]).toBe('Only');
	});

	it('groups release years by decade and toggles to single years sorted by count then label', () => {
		const c = render({
			titles: [
				title({ id: '1', releaseDate: '2019-01-01' }),
				title({ id: '2', releaseDate: '2011-01-01' }),
				title({ id: '3', releaseDate: '2012-01-01' }),
				title({ id: '4', releaseDate: '2012-06-01' }),
			],
		});
		const byYear = qsa(c, '.hoard-stats-card').find(
			(k) => k.querySelector('.hoard-stats-card-title')?.textContent === 'By year',
		)!;
		expect(texts(byYear, '.hoard-metric-label')).toEqual(['2010s']);
		expect(texts(byYear, '.hoard-metric-value')).toEqual(['4']);
		byYear.querySelector<HTMLElement>('.hoard-stat-toggle')!.click();
		expect(texts(byYear, '.hoard-metric-label')).toEqual(['2012', '2011', '2019']);
	});

	it('shows the empty state for a bare library', () => {
		expect(render().querySelector('.hoard-stats-grid .hoard-empty-state')).not.toBeNull();
	});
});
