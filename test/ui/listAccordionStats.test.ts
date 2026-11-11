import { describe, expect, it } from 'vitest';
import { formatTime } from '../../src/types';
import type { HoardTitle, Season } from '../../src/types';
import { setupListTab, showNote } from '../helpers/setupListTab';

interface Dom {
	root: HTMLElement;
	box: HTMLElement;
	stats: HTMLElement[];
	progress: HTMLElement;
	bar: HTMLElement;
	countEl: HTMLElement;
}

const el = (parent: HTMLElement, tag: string, cls: string): HTMLElement => {
	const e = document.createElement(tag);
	e.className = cls;
	parent.appendChild(e);
	return e;
};

function buildDom(): Dom {
	const root = document.createElement('div');
	const acc = el(root, 'div', 'hoard-accordion');
	const right = el(acc, 'div', 'hoard-accordion__header-right');
	const progress = el(right, 'span', 'hoard-accordion__percent');
	const bar = el(right, 'div', 'hoard-progress__bar');
	const stats = [0, 1, 2].map(() => el(el(acc, 'div', 'hoard-accordion__stat-block'), 'span', 'hoard-accordion__percent'));
	const season = el(acc, 'div', 'hoard-season');
	const countEl = el(el(season, 'div', 'hoard-accordion__season-header'), 'span', 'hoard-accordion__season-episode-count');
	const box = el(el(season, 'div', 'hoard-accordion__episode-grid'), 'div', 'hoard-accordion__episode-box');
	return { root, box, stats, progress, bar, countEl };
}

async function setup() {
	const env = await setupListTab({ 'W/TV Show/Show.md': showNote('Show', 'episodeDuration: 30\n') });
	const title: HoardTitle = env.dm.getTitles()[0]!;
	const update = (box: HTMLElement, season: Season | null) =>
		(env.tab as unknown as { updateAccordionStats: (b: HTMLElement, t: HoardTitle, s: Season | null) => void })
			.updateAccordionStats(box, title, season);
	return { ...env, title, update };
}

describe('ListTab.updateAccordionStats', () => {
	it('does nothing when the box is outside an accordion', async () => {
		const { update } = await setup();
		const lone = document.createElement('div');
		expect(() => update(lone, null)).not.toThrow();
		expect(lone.textContent).toBe('');
	});

	it('refreshes time, episode and progress readouts from live data', async () => {
		const { update, title, dm } = await setup();
		title.watchedEpisodes = [1, 2];
		const d = buildDom();
		update(d.box, null);
		expect(d.stats[1]!.textContent).toBe(formatTime(dm.calcTimeWatched(title)));
		expect(d.stats[2]!.textContent).toBe(`2 / ${dm.getEffectiveTotal(title)}`);
		expect(d.progress.textContent).toBe(`${dm.getProgress(title)}%`);
		expect(d.bar.style.getPropertyValue('--hoard-progress-width')).toBe(`${dm.getProgress(title)}%`);
		expect(d.countEl.textContent).toBe('');
	});

	it('updates the season episode count, including skipped episodes', async () => {
		const { update } = await setup();
		const d = buildDom();
		update(d.box, { name: 'S1', episodes: 4, offset: 0, skippedEpisodes: [2] });
		expect(d.countEl.textContent).toContain('4');
		expect(d.countEl.textContent).toContain('1');
		const plain = buildDom();
		update(plain.box, { name: 'S1', episodes: 4, offset: 0 });
		expect(plain.countEl.textContent).toContain('4');
		expect(plain.countEl.textContent).not.toBe(d.countEl.textContent);
	});

	it('tolerates missing stat elements and season wrapper', async () => {
		const { update } = await setup();
		const box = el(el(document.createElement('div'), 'div', 'hoard-accordion'), 'div', 'hoard-accordion__episode-box');
		expect(() => update(box, { name: 'S1', episodes: 2, offset: 0 })).not.toThrow();
	});
});
