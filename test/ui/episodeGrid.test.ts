import { describe, expect, it, vi } from 'vitest';
import { renderEpisodeGrid, type EpisodeGridOptions } from '../../src/ui/EpisodeGrid';
import type { HoardTitle, Season } from '../../src/types';

function setup(over: { watched?: number[]; season?: Season | null; perSeason?: boolean; total?: number } = {}) {
	const title = { watchedEpisodes: over.watched ?? [], totalEpisodes: over.total ?? 3 } as unknown as HoardTitle;
	const onFill = vi.fn();
	const onEpisode = vi.fn();
	const opts: EpisodeGridOptions = {
		getTitle: () => title,
		season: over.season ?? null,
		perSeason: over.perSeason ?? false,
		labels: { clearAll: 'clear', markAll: 'mark' },
		episodeTooltip: (n, skipped) => `ep${n}${skipped ? '-skipped' : ''}`,
		onFill,
		onEpisode,
	};
	const parent = document.createElement('div');
	renderEpisodeGrid(parent, opts);
	const boxes = () => Array.from(parent.querySelectorAll<HTMLElement>('.hoard-episode-box'));
	return { parent, title, onFill, onEpisode, boxes, fill: () => parent.querySelector<HTMLElement>('.hoard-season-fill-btn')! };
}

describe('renderEpisodeGrid', () => {
	it('renders one box per episode of a seasonless title with a mark-all button', () => {
		const t = setup({ watched: [2] });
		expect(t.boxes().map((b) => b.textContent)).toEqual(['1', '✓', '3']);
		expect(t.boxes()[1]!.classList.contains('is-watched')).toBe(true);
		expect(t.boxes()[0]!.title).toBe('ep1');
		expect(t.fill().textContent).toBe('✓');
		expect(t.fill().title).toBe('mark');
		expect(t.fill().classList.contains('is-fill')).toBe(true);
	});

	it('shows clear button when all season episodes are watched and passes the toggle direction', () => {
		const t = setup({ watched: [1, 2, 3] });
		expect(t.fill().textContent).toBe('✗');
		expect(t.fill().title).toBe('clear');
		expect(t.fill().classList.contains('is-clear')).toBe(true);
		t.fill().click();
		expect(t.onFill).toHaveBeenCalledWith([1, 2, 3], false, expect.anything());
	});

	it('offers mark-all for a partially watched grid and for an empty one', () => {
		const t = setup({ watched: [1] });
		t.fill().click();
		expect(t.onFill).toHaveBeenCalledWith([1, 2, 3], true, expect.anything());
		const empty = setup({ total: 0 });
		expect(empty.boxes()).toHaveLength(0);
		expect(empty.fill().textContent).toBe('✓');
	});

	it('uses season offset, per-season numbering and skipped marks', () => {
		const season = { episodes: 2, offset: 10, skippedEpisodes: [2] } as unknown as Season;
		const t = setup({ season, perSeason: true, watched: [11] });
		expect(t.boxes().map((b) => b.textContent)).toEqual(['✓', '—']);
		expect(t.boxes()[1]!.classList.contains('is-skipped')).toBe(true);
		expect(t.boxes()[1]!.title).toBe('ep12-skipped');
		const global = setup({ season, perSeason: false });
		expect(global.boxes().map((b) => b.textContent)).toEqual(['11', '—']);
	});

	it('treats a season without skippedEpisodes as nothing skipped', () => {
		const season = { episodes: 1, offset: 0 } as unknown as Season;
		const t = setup({ season });
		expect(t.boxes()[0]!.classList.contains('is-skipped')).toBe(false);
	});

	it('repaints a box and the fill button from live state after an episode click', () => {
		const t = setup({ total: 1 });
		t.onEpisode.mockImplementation((_n: number, _e: unknown, refreshBox: () => void, refreshFill: () => void) => {
			t.title.watchedEpisodes.push(1);
			refreshBox();
			refreshFill();
		});
		t.boxes()[0]!.click();
		expect(t.onEpisode).toHaveBeenCalledWith(1, expect.anything(), expect.any(Function), expect.any(Function));
		expect(t.boxes()[0]!.textContent).toBe('✓');
		expect(t.fill().textContent).toBe('✗');
	});
});
