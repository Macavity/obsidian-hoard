import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetRenderer } from '../../src/WidgetRenderer';
import type { HoardGroup, HoardTitle } from '../../src/types';
import { textsOf as text } from '../helpers/dom';

type Processor = (source: string, el: HTMLElement) => void;

const title = (over: Partial<HoardTitle>): HoardTitle =>
	({
		id: 't1', title: 'Show', type: 'Anime', status: 'Watching', watchedEpisodes: [1], totalEpisodes: 3,
		dateAdded: '2024-03-01', pinned: false, ...over,
	}) as unknown as HoardTitle;

interface Fixture {
	titles: HoardTitle[];
	groups?: HoardGroup[];
	pinnedGroupId?: string | null;
	airtime?: { titleId: string; schedule: { recurrence: 'once'; releaseDate: string } }[];
	nextEp?: number | null;
}

function setup(f: Fixture) {
	const map = new Map<string, Processor>();
	const marked: unknown[][] = [];
	const plugin = {
		registerMarkdownCodeBlockProcessor: (lang: string, fn: Processor) => map.set(lang, fn),
		register: () => {},
		settings: { types: [{ name: 'Anime', color: '#f00' }], statuses: [], coloredTypeBadges: true, colorTheme: 'default' },
	};
	const dm = {
		getAirtimeEntries: () => f.airtime ?? [],
		getTitles: () => f.titles,
		getTitle: (id: string) => f.titles.find((x) => x.id === id),
		getPinnedGroupId: () => f.pinnedGroupId ?? null,
		getGroups: () => f.groups ?? [],
		getProgress: () => 33,
		getEffectiveTotal: () => 4,
		getNextUnwatchedEpisode: () => (f.nextEp === undefined ? 2 : f.nextEp),
		markEpisodeWatched: (...a: unknown[]) => { marked.push(a); return Promise.resolve(); },
	};
	new WidgetRenderer(plugin as never, dm as never);
	return { map, marked };
}

const run = (p: Processor, source: string): HTMLElement => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	p(source, el);
	return el;
};

beforeEach(() => {
	vi.stubGlobal('activeDocument', document);
});
afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

describe('hoard-todo widget', () => {
	it('reports a missing title name', () => {
		const { map } = setup({ titles: [] });
		expect(text(run(map.get('hoard-todo')!, 'mini\n'), '.hoard-widget__error')[0]).toContain('hoard-todo:');
	});

	it('reports an unknown title, matching names case-insensitively otherwise', () => {
		const { map } = setup({ titles: [title({})] });
		expect(text(run(map.get('hoard-todo')!, 'nope'), '.hoard-widget__error')[0]).toContain('nope');
		const ok = run(map.get('hoard-todo')!, 'SHOW');
		expect(ok.querySelector('.hoard-widget__error')).toBeNull();
		expect(ok.classList.contains('hoard-widget')).toBe(true);
	});

	it('renders the minimal row for "mini"', () => {
		const { map } = setup({ titles: [title({})] });
		const el = run(map.get('hoard-todo')!, 'Show\nmini');
		expect(el.classList.contains('hoard-widget-minimal')).toBe(true);
	});

	it('full widget: badges, progress, started date, next episode', () => {
		const { map } = setup({ titles: [title({ dateStarted: '2024-05-06' })] });
		const el = run(map.get('hoard-todo')!, 'Show');
		expect(text(el, '.hoard-widget__title')).toEqual(['Show']);
		expect(text(el, '.hoard-widget__percent')).toEqual(['33%']);
		expect(el.querySelectorAll('.hoard-badge').length).toBeGreaterThan(0);
		expect(text(el, '.hoard-widget__date')[0]).toMatch(/Since|seit/i);
		expect(text(el, '.hoard-widget__next-label')[0]).toContain('2');
	});

	it('full widget: uses the added date when not started and strikes the title through on the task box', () => {
		const { map } = setup({ titles: [title({})] });
		const el = run(map.get('hoard-todo')!, 'Show');
		expect(text(el, '.hoard-widget__date')[0]).not.toMatch(/Since/i);
		const cb = el.querySelector<HTMLInputElement>('.hoard-widget__checkbox')!;
		cb.checked = true;
		cb.dispatchEvent(new Event('change'));
		expect(el.querySelector<HTMLElement>('.hoard-widget__title')!.classList.contains('is-done')).toBe(true);
		cb.checked = false;
		cb.dispatchEvent(new Event('change'));
		expect(el.querySelector<HTMLElement>('.hoard-widget__title')!.classList.contains('is-done')).toBe(false);
	});

	it('full widget: all watched shows the check label and no episode checkbox', () => {
		const { map } = setup({ titles: [title({})], nextEp: null });
		const el = run(map.get('hoard-todo')!, 'Show');
		expect(text(el, '.hoard-widget__next-label')[0]).toContain('✓');
		expect(el.querySelector('.hoard-widget__next-checkbox')).toBeNull();
	});

	it('full widget: ticking the next episode marks it watched', async () => {
		const { map, marked } = setup({ titles: [title({})] });
		const el = run(map.get('hoard-todo')!, 'Show');
		const cb = el.querySelector<HTMLInputElement>('.hoard-widget__next-checkbox')!;
		cb.checked = true;
		cb.dispatchEvent(new Event('change'));
		await Promise.resolve();
		expect(marked).toEqual([['t1', 2, true]]);
	});

	it('full widget: a movie toggles watched state', () => {
		const { map, marked } = setup({ titles: [title({ type: 'Movie', watchedEpisodes: [1] })] });
		const el = run(map.get('hoard-todo')!, 'Show');
		const cb = el.querySelector<HTMLInputElement>('.hoard-widget__next-checkbox')!;
		expect(cb.checked).toBe(true);
		expect(text(el, '.hoard-widget__next-label')).toEqual(['Watched']);
		cb.checked = false;
		cb.dispatchEvent(new Event('change'));
		expect(marked).toEqual([['t1', 1, false]]);
		const unwatched = setup({ titles: [title({ type: 'Movie', watchedEpisodes: [] })] });
		const el2 = run(unwatched.map.get('hoard-todo')!, 'Show');
		expect(text(el2, '.hoard-widget__next-label')).toEqual(['Mark as watched']);
	});
});

describe('hoard-now-next widget', () => {
	const dayOffset = (days: number): string => {
		const d = new Date();
		d.setDate(d.getDate() + days);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const entry = (id: string, days: number) => ({ titleId: id, schedule: { recurrence: 'once' as const, releaseDate: dayOffset(days) } });

	it('shows placeholders without a pin or release', () => {
		const { map } = setup({ titles: [title({})] });
		const el = run(map.get('hoard-now-next')!, '');
		expect(text(el, '.hoard-widget__full-card-subtitle')).toEqual(['Nothing pinned.', 'No upcoming.']);
	});

	it('shows a pinned title with its progress and the next release countdown', () => {
		const cases: [number, RegExp][] = [[0, /Today/i], [1, /Tomorrow/i], [5, /5/]];
		for (const [days, re] of cases) {
			const { map } = setup({
				titles: [title({ pinned: true }), title({ id: 't2', title: 'Soon' })],
				airtime: [entry('t2', days)],
			});
			const el = run(map.get('hoard-now-next')!, '');
			expect(text(el, '.hoard-widget__full-card-title')).toEqual(['Show', 'Soon']);
			expect(text(el, '.hoard-widget__full-card-subtitle')[0]).toBe('33%');
			expect(text(el, '.hoard-widget__full-card-subtitle')[1]).toMatch(re);
		}
	});

	it('shows a pinned group with member count and progress', () => {
		const group = { id: 'g1', name: 'Marathon', titleIds: ['t1', 'ghost'] } as unknown as HoardGroup;
		const { map } = setup({ titles: [title({})], groups: [group], pinnedGroupId: 'g1' });
		const el = run(map.get('hoard-now-next')!, '');
		expect(text(el, '.hoard-widget__full-card-title')).toEqual(['Marathon']);
		expect(text(el, '.hoard-widget__full-card-subtitle')[0]).toContain('25%');
	});
});
