import { afterEach, describe, it, expect, vi } from 'vitest';
import { WidgetRenderer, findNextRelease, groupProgress } from '../src/WidgetRenderer';
import type { HoardTitle } from '../src/types';

const t = (id: string, watched: number[], over: Partial<HoardTitle> = {}): HoardTitle =>
	({ id, title: `T${id}`, type: 'Series', watchedEpisodes: watched, ...over }) as HoardTitle;

describe('groupProgress', () => {
	it('is 0 without episodes', () => {
		expect(groupProgress([], () => 0)).toBe(0);
		expect(groupProgress([t('a', [])], () => 0)).toBe(0);
	});
	it('rounds the watched share over all members', () => {
		expect(groupProgress([t('a', [1, 2]), t('b', [1])], () => 4)).toBe(38);
	});
	it('caps at 100', () => {
		expect(groupProgress([t('a', [1, 2, 3])], () => 2)).toBe(100);
	});
});

describe('findNextRelease', () => {
	const now = new Date('2030-01-10T00:00:00').getTime();
	const entry = (titleId: string, releaseDate: string | undefined, recurrence = 'once') =>
		({ titleId, schedule: { recurrence, releaseDate } }) as never;

	it('picks the soonest future one-off release', () => {
		const res = findNextRelease(
			[entry('a', '2030-03-01'), entry('b', '2030-01-12'), entry('c', '2029-12-01')],
			[t('a', []), t('b', []), t('c', [])],
			now,
		);
		expect(res).toEqual({ titleName: 'Tb', type: 'Series', releaseDate: '2030-01-12', daysUntil: 2 });
	});
	it('keeps a release dated today until midnight and drops yesterday', () => {
		const evening = new Date('2030-01-10T18:30:00').getTime();
		const res = findNextRelease(
			[entry('a', '2030-01-09'), entry('b', '2030-01-10'), entry('c', '2030-01-11')],
			[t('a', []), t('b', []), t('c', [])],
			evening,
		);
		expect(res).toMatchObject({ releaseDate: '2030-01-10', daysUntil: 0 });
	});
	it('ignores recurring, undated and unknown-title entries', () => {
		expect(findNextRelease(
			[entry('a', '2030-02-01', 'weekly'), entry('b', undefined), entry('x', '2030-02-01')],
			[t('a', []), t('b', [])],
			now,
		)).toBeNull();
	});
});

type Handler = (source: string, el: HTMLElement, ctx: unknown) => void;

interface Fixture {
	colorTheme?: string;
	titles?: HoardTitle[];
	pinnedGroupId?: string | null;
	releases?: Array<{ titleId: string; releaseDate: string }>;
}

/** Mounts a WidgetRenderer on a fake plugin/data manager; `run` renders one code block. */
function mountRenderer(fx: Fixture = {}) {
	vi.stubGlobal('activeDocument', document);
	const handlers = new Map<string, Handler>();
	const titles = fx.titles ?? [];
	const plugin = {
		settings: {
			colorTheme: fx.colorTheme ?? 'default',
			coloredTypeBadges: true,
			types: [{ name: 'Series', color: '#123456' }, { name: 'Movie', color: '#654321' }],
			statuses: [{ name: 'Watching', color: '#00aa00' }],
		},
		registerMarkdownCodeBlockProcessor: (lang: string, fn: Handler) => handlers.set(lang, fn),
		register: () => {},
	};
	const dm = {
		getTitle: (id: string) => titles.find((x) => x.id === id),
		getTitles: () => titles,
		getProgress: (x: HoardTitle) => x.watchedEpisodes.length * 10,
		getNextUnwatchedEpisode: (x: HoardTitle) => (x.watchedEpisodes.length >= 10 ? null : x.watchedEpisodes.length + 1),
		getEffectiveTotal: () => 10,
		getTotalTimeWatched: () => 1500,
		getTotalTimeRemaining: () => 30,
		getCompletedCount: () => 4,
		getPinnedGroupId: () => fx.pinnedGroupId ?? null,
		getGroups: () => [{ id: 'g', name: 'Group G', titleIds: ['s'] }],
		getAirtimeEntries: () => (fx.releases ?? []).map((r) => ({ titleId: r.titleId, schedule: { recurrence: 'once', releaseDate: r.releaseDate } })),
		markEpisodeWatched: vi.fn(async () => {}),
	};
	new WidgetRenderer(plugin as never, dm as never);
	const run = (lang: string, source: string): HTMLElement => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		handlers.get(lang)!(source, el, {});
		return el;
	};
	return { run, dm, titles, languages: () => [...handlers.keys()] };
}

const series = (over: Partial<HoardTitle> = {}): HoardTitle =>
	t('s', [1, 2], { title: 'Show', type: 'Series', status: 'Watching', dateAdded: '2030-01-01', ...over });
const movie = (watched: number[] = []): HoardTitle =>
	t('m', watched, { title: 'Film', type: 'Movie', status: 'Watching', dateAdded: '2030-01-01', dateStarted: '2030-01-02' });

describe('WidgetRenderer', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
		document.body.empty();
	});

	it('marks widget roots with the picked Hoard theme', () => {
		expect(mountRenderer({ colorTheme: 'nightfall' }).run('hoard', 'id: x').getAttribute('data-theme')).toBe('nightfall');
	});

	it('leaves the default theme unmarked', () => {
		expect(mountRenderer().run('hoard', 'id: x').hasAttribute('data-theme')).toBe(false);
	});

	it('hoard: reports a missing id or title, renders a series row with next-up', () => {
		const { run } = mountRenderer({ titles: [series()] });
		expect(run('hoard', '').textContent).toContain('Missing id');
		expect(run('hoard', 'id: nope').textContent).toContain('"nope" not found');
		const el = run('hoard', 'id: s');
		expect(el.classList.contains('hoard-widget')).toBe(true);
		expect(el.textContent).toContain('Next up: Ep 3');
		expect(el.querySelector<HTMLElement>('.hoard-progress-bar')!.style.width).toBe('20%');
	});

	it('hoard: task marker strikes the title; a fully watched series says so', () => {
		const { run } = mountRenderer({ titles: [series({ watchedEpisodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })] });
		const el = run('hoard', 'id: s');
		expect(el.textContent).toContain('All episodes watched');
		const cb = el.querySelector<HTMLInputElement>('.hoard-widget-cb')!;
		cb.checked = true;
		cb.dispatchEvent(new Event('change'));
		expect(el.querySelector<HTMLElement>('.hoard-widget-title')!.style.textDecoration).toBe('line-through');
	});

	it('hoard: a movie checkbox writes the watched state and re-renders', async () => {
		const { run, dm } = mountRenderer({ titles: [movie()] });
		const el = run('hoard', 'id: m');
		expect(el.textContent).toContain('Mark as watched');
		const cb = el.querySelector<HTMLInputElement>('.hoard-widget-next-cb')!;
		cb.checked = true;
		cb.dispatchEvent(new Event('change'));
		await Promise.resolve();
		expect(dm.markEpisodeWatched).toHaveBeenCalledWith('m', 1, true);
	});

	it('hoard-todo: errors, full and mini rows', () => {
		const { run } = mountRenderer({ titles: [series(), movie([1])] });
		expect(run('hoard-todo', 'mini').textContent).toContain('Missing title name');
		expect(run('hoard-todo', 'Nope').textContent).toContain('"Nope" not found');
		expect(run('hoard-todo', 'show').classList.contains('hoard-widget')).toBe(true);
		const mini = run('hoard-todo', 'Film\nmini');
		expect(mini.classList.contains('hoard-widget-minimal')).toBe(true);
		expect(mini.querySelector<HTMLInputElement>('.hoard-widget-next-cb')!.checked).toBe(true);
		expect(run('hoard-todo', 'Show\nmini').querySelector('.hoard-widget-next-cb')).not.toBeNull();
	});

	it('hoard-todo mini: a finished series shows a disabled, checked box', () => {
		const { run } = mountRenderer({ titles: [series({ watchedEpisodes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] })] });
		const cb = run('hoard-todo', 'Show\nmini').querySelector<HTMLInputElement>('.hoard-widget-next-cb')!;
		expect([cb.checked, cb.disabled]).toEqual([true, true]);
	});

	it('hoard-stat: every kind renders, unknown kinds explain the options', () => {
		const { run } = mountRenderer();
		expect(run('hoard-stat', 'watched').textContent).toContain('25h');
		expect(run('hoard-stat', 'completed').textContent).toContain('4 titles');
		expect(run('hoard-stat', 'remaining').textContent).toContain('30m');
		expect(run('hoard-stat', 'time').textContent).toContain('left');
		expect(run('hoard-stat', 'time full').textContent).toContain('1 day 1h');
		expect(run('hoard-stat', 'completed full').textContent).toContain('titles completed');
		expect(run('hoard-stat', 'time completed full').classList.contains('hoard-wstat-triple')).toBe(true);
		expect(run('hoard-stat', 'bogus').textContent).toContain('Unknown stat "bogus"');
	});

	it('hoard-upcoming: empty, compact countdowns and the full card', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2030-01-10T12:00:00'));
		expect(mountRenderer().run('hoard-upcoming', 'next').textContent).toContain('No upcoming titles.');
		expect(mountRenderer().run('hoard-upcoming', 'next full').textContent).toContain('No upcoming titles.');
		expect(mountRenderer().run('hoard-upcoming', 'later').textContent).toContain('Only "next"');
		const at = (releaseDate: string) => mountRenderer({ titles: [series()], releases: [{ titleId: 's', releaseDate }] });
		expect(at('2030-01-10').run('hoard-upcoming', 'next').textContent).toContain('today');
		expect(at('2030-01-11').run('hoard-upcoming', 'next').textContent).toContain('tomorrow');
		expect(at('2030-03-11').run('hoard-upcoming', 'next').textContent).toContain('(2 months)');
		expect(at('2030-01-15').run('hoard-upcoming', 'next full').textContent).toContain('in 5 days');
	});

	it('registers the frozen widget names', () => {
		expect(mountRenderer().languages()).toEqual(['hoard', 'hoard-todo', 'hoard-stat', 'hoard-upcoming', 'hoard-now', 'hoard-now-next']);
	});

	it('hoard-now: empty, pinned title, pinned group, compact and full', () => {
		expect(mountRenderer().run('hoard-now', '').textContent).toContain('Pin a title');
		expect(mountRenderer().run('hoard-now', 'full').textContent).toContain('Pin a title');
		const pinned = mountRenderer({ titles: [series({ pinned: true }), movie()] });
		expect(pinned.run('hoard-now', '').textContent).toContain('Ep 3');
		expect(pinned.run('hoard-now', 'full').textContent).toContain('20%');
		const group = mountRenderer({ titles: [series()], pinnedGroupId: 'g' });
		expect(group.run('hoard-now', '').textContent).toContain('1 title');
		expect(group.run('hoard-now', 'full').textContent).toContain('Group G');
	});

	it('hoard-now-next: both columns for nothing, a title, a group', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2030-01-10T12:00:00'));
		expect(mountRenderer().run('hoard-now-next', '').textContent).toContain('No upcoming.');
		const titled = mountRenderer({ titles: [series({ pinned: true })], releases: [{ titleId: 's', releaseDate: '2030-01-14' }] });
		expect(titled.run('hoard-now-next', '').textContent).toContain('in 4d');
		expect(mountRenderer({ titles: [series()], pinnedGroupId: 'g' }).run('hoard-now-next', '').textContent).toContain('1 title · 20%');
	});

	it('re-renders live widgets on hoard-data-changed and drops detached or deleted ones', () => {
		const { run, titles } = mountRenderer({ titles: [series(), movie()] });
		const full = run('hoard', 'id: s');
		const mini = run('hoard-todo', 'Film\nmini');
		const stat = run('hoard-stat', 'completed');
		const gone = run('hoard', 'id: m');
		gone.remove();
		titles[0]!.title = 'Renamed';
		titles.splice(1, 1);
		document.dispatchEvent(new Event('hoard-data-changed'));
		expect(full.textContent).toContain('Renamed');
		expect(mini.textContent).toContain('Film');
		expect(stat.textContent).toContain('4 titles');
	});
});
