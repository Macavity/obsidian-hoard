import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from '../__mocks__/obsidian';
import { t } from '../../src/i18n';
import type { Book, Game, Manga } from '../../src/types';
import { qsa } from '../helpers/dom';
import type { Captures } from './airtimeTab.harness';
import { entry, isoOffset, makeTab, newWorld, title } from './airtimeTab.harness';

const cap = vi.hoisted<Captures>(() => ({
	confirms: [], finders: [], readingModals: [], gameModals: [], forms: [],
}));

vi.mock('../../src/ConfirmModal', () => ({
	ConfirmModal: class {
		constructor(_app: unknown, message: string, onConfirm: () => void, extra?: { label: string; onClick: () => void }) {
			cap.confirms.push({ message, onConfirm, extra });
		}
		open(): void {}
	},
}));
vi.mock('../../src/UpcomingFinderModal', () => ({
	UpcomingFinderModal: class {
		constructor(_app: unknown, items: Captures['finders'][number]['items'], onPick: (i: unknown) => void) {
			cap.finders.push({ items, onPick });
		}
		open(): void {}
	},
}));
vi.mock('../../src/ReadingScheduleModal', () => ({
	ReadingScheduleModal: class {
		constructor(...args: unknown[]) { cap.readingModals.push(args); }
		open(): void {}
	},
}));
vi.mock('../../src/GameScheduleModal', () => ({
	GameScheduleModal: class {
		constructor(...args: unknown[]) { cap.gameModals.push(args); }
		open(): void {}
	},
}));
vi.mock('../../src/ui/ScheduleForm', async (orig) => ({
	...(await orig<typeof import('../../src/ui/ScheduleForm')>()),
	renderScheduleModal: (_el: unknown, form: unknown, opts: Captures['forms'][number]['opts']) => {
		cap.forms.push({ form, opts });
	},
}));
vi.mock('../../src/VirtualScroller', () => ({
	VirtualScroller: class {
		addSection(): void {}
		attach(): void {}
		destroy(): void {}
	},
}));
vi.mock('../../src/VirtualGrid', async (orig) => ({
	...(await orig<typeof import('../../src/VirtualGrid')>()),
	VirtualGrid: class {
		constructor(_s: unknown, grid: HTMLElement, count: number, cb: { buildItem: (i: number, w: number) => HTMLElement | null }) {
			for (let i = 0; i < count; i++) {
				const el = cb.buildItem(i, 200);
				if (el) grid.appendChild(el);
			}
		}
	},
}));

beforeEach(() => {
	vi.stubGlobal('activeWindow', { open: vi.fn() });
});
afterEach(() => {
	vi.unstubAllGlobals();
	document.body.replaceChildren();
	cap.confirms.length = 0;
	cap.finders.length = 0;
	cap.readingModals.length = 0;
	cap.gameModals.length = 0;
	cap.forms.length = 0;
	Notice.shown.length = 0;
});

const book = (over: Partial<Book> = {}): Book => ({ id: 'b1', title: 'Dune', totalChapters: 40, externalLink: 'b-link', coverUrl: '', ...over }) as unknown as Book;
const manga = (over: Partial<Manga> = {}): Manga => ({ id: 'm1', title: 'Berserk', totalChapters: 364, externalLink: '', coverUrl: '', ...over }) as unknown as Manga;
const game = (over: Partial<Game> = {}): Game => ({ id: 'g1', title: 'Hades', storeUrl: '', externalLink: 'g-link', coverUrl: '', type: 'RPG', status: 'Backlog', releaseDate: null, ...over }) as unknown as Game;

type FormState = { mode: string; recurrence: string; releaseDate: string; releaseTime: string; dayOfWeek: number };
const lastForm = (): { form: FormState; save: () => Promise<void>; hint: (m: string) => string } => {
	const f = cap.forms[cap.forms.length - 1]!;
	return { form: f.form as FormState, save: f.opts.onSave, hint: f.opts.hint };
};
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('add flow', () => {
	it('tells the user when there is nothing to add or everything is added', () => {
		makeTab(newWorld()).priv.openAddFlow();
		expect(Notice.shown).toEqual([t('airtime.notices.noTitles')]);
		const w = newWorld({
			titles: [title()], books: [book()], manga: [manga()], games: [game()],
			entries: [
				entry(), entry({ id: 'e2', titleId: 'b1', source: 'reading', readingKind: 'book' }),
				entry({ id: 'e3', titleId: 'm1', source: 'reading', readingKind: 'manga' }), entry({ id: 'e4', titleId: 'g1', source: 'game' }),
			],
		});
		makeTab(w).priv.openAddFlow();
		expect(Notice.shown[1]).toBe(t('airtime.notices.allAdded'));
		expect(cap.finders).toHaveLength(0);
	});

	it('lists what is not yet tracked, keeping source id spaces apart', () => {
		const w = newWorld({
			titles: [title(), title({ id: 't2', title: 'Other', type: 'Movie' })],
			books: [book({ id: 't2' })], manga: [manga()], games: [game()],
			entries: [entry({ source: 'watchlist' }), entry({ id: 'e9', titleId: 'g1', source: 'game' })],
		});
		makeTab(w).priv.openAddFlow();
		expect(cap.finders[0]!.items.map((i) => `${i.source}:${i.id}:${i.typeLabel}`)).toEqual([
			'watchlist:t2:Movie', 'reading:t2:Book', 'reading:m1:Manga',
		]);
	});

	it('routes a picked item to the matching schedule modal', async () => {
		const w = newWorld({ titles: [title()], books: [book()], manga: [manga()], games: [game()] });
		const { priv } = makeTab(w);
		priv.openAddFlow();
		const pick = cap.finders[0]!.onPick;
		pick({ source: 'reading', kind: 'book', id: 'b1' });
		pick({ source: 'reading', kind: 'manga', id: 'm1' });
		pick({ source: 'reading', id: 'b1' });
		pick({ source: 'reading', kind: 'book', id: 'nope' });
		expect(cap.readingModals.map((a) => a[2])).toEqual(['book', 'manga', 'book']);
		pick({ source: 'game', id: 'g1' });
		pick({ source: 'game', id: 'nope' });
		expect(cap.gameModals).toHaveLength(1);
		pick({ source: 'watchlist', id: 't1' });
		pick({ source: 'watchlist', id: 'nope' });
		await flush();
		expect(cap.forms).toHaveLength(1);
	});
});

describe('adding a watchlist title', () => {
	const start = (w: ReturnType<typeof newWorld>) => {
		const h = makeTab(w);
		const ti = w.titles[0]!;
		return { ...h, run: () => h.priv.startAddWithTitle(ti) as Promise<void> };
	};

	it('prefills the Jikan airing slot for anime and says so', async () => {
		const w = newWorld({ titles: [title({ malId: 5 })], anime: { dayOfWeek: 3, time: '18:30' } });
		await start(w).run();
		expect(Notice.shown).toEqual([t('airtime.notices.autoFilled')]);
		expect(lastForm().form).toMatchObject({ mode: 'recurring', recurrence: 'weekly', dayOfWeek: 3, releaseTime: '18:30' });
	});

	it('falls back to the release date when Jikan has nothing or fails', async () => {
		for (const over of [{ anime: null }, { animeThrows: true }]) {
			const w = newWorld({ titles: [title({ malId: 5, releaseDate: '2027-02-03', totalEpisodes: 1 })], ...over });
			await start(w).run();
			expect(lastForm().form).toMatchObject({ mode: 'single', releaseDate: '2027-02-03' });
		}
		expect(Notice.shown).toEqual([]);
	});

	it('ignores malformed release dates and non-anime types for the lookup', async () => {
		const w = newWorld({ titles: [title({ type: 'Movie', malId: 5, releaseDate: '2027-02', totalEpisodes: 1 })], anime: { dayOfWeek: 1, time: '10:00' } });
		await start(w).run();
		expect(Notice.shown).toEqual([]);
		expect(lastForm().form.releaseDate).toBe('');
	});

	it('saving adds the entry, syncs the title and re-renders', async () => {
		const ti = title({ releaseDate: '2027-02-03', totalEpisodes: 1 });
		const h = start(newWorld({ titles: [ti] }));
		await h.run();
		await lastForm().save();
		const added = h.calls.find((c) => c.startsWith('addAirtimeEntry'));
		expect(added).toContain('"id":"air-t1"');
		expect(added).toContain('"recurrence":"once"');
		// nothing differs from the title, so no write
		expect(h.calls.some((c) => c.startsWith('updateTitle'))).toBe(false);
		expect(h.container.classList.contains('hoard-airtime')).toBe(true);
	});

	it('saving a single release writes a changed date back to the title', async () => {
		const ti = title({ releaseDate: '2027-02-03', totalEpisodes: 1 });
		const h = start(newWorld({ titles: [ti] }));
		await h.run();
		lastForm().form.releaseDate = '2027-05-06';
		await lastForm().save();
		expect(ti.releaseDate).toBe('2027-05-06');
		expect(h.calls.some((c) => c.startsWith('updateTitle'))).toBe(true);
	});

	it('a recurring save leaves the title date alone', async () => {
		const ti = title({ releaseDate: '2027-02-03' });
		const h = start(newWorld({ titles: [ti] }));
		await h.run();
		await lastForm().save();
		expect(ti.releaseDate).toBe('2027-02-03');
		expect(h.calls.some((c) => c.startsWith('updateTitle'))).toBe(false);
	});

	it('does not touch a title that vanished meanwhile', async () => {
		const w = newWorld({ titles: [title()] });
		const h = start(w);
		await h.run();
		w.titles.length = 0;
		await lastForm().save();
		expect(h.calls.some((c) => c.startsWith('updateTitle'))).toBe(false);
	});
});

describe('editing a watchlist schedule', () => {
	it('opens the modal with the entry state and the requested mode hint', () => {
		const e = entry({ schedule: { recurrence: 'weekly', dayOfWeek: 2, releaseTime: '20:00' }, currentSeason: 1, currentEpisode: 4 });
		const { priv } = makeTab(newWorld({ titles: [title()], entries: [e] }));
		priv.openEditWatchSchedule(e, 'single');
		expect(lastForm().form).toMatchObject({ mode: 'single', dayOfWeek: 2, releaseTime: '20:00' });
		expect(lastForm().hint('single')).toBe(t('airtime.modal.hintSingle'));
		expect(lastForm().hint('recurring')).toBe(t('airtime.modal.hintRecurring'));
	});

	it('does nothing for an orphaned entry', () => {
		const e = entry({ titleId: 'gone' });
		makeTab(newWorld({ entries: [e] })).priv.openEditWatchSchedule(e);
		expect(cap.forms).toHaveLength(0);
	});

	it('saving updates the entry and syncs totals and date to the title', async () => {
		const ti = title({ totalEpisodes: 12, releaseDate: '2026-01-01' });
		const e = entry({ schedule: { recurrence: 'once', releaseDate: '2027-03-04' }, totalEpisodes: 24, currentEpisode: 2 });
		const h = makeTab(newWorld({ titles: [ti], entries: [e] }));
		h.priv.openEditWatchSchedule(e);
		await lastForm().save();
		expect(e.schedule).toEqual({ recurrence: 'once', releaseDate: '2027-03-04' });
		expect(e).toMatchObject({ totalEpisodes: 24, currentEpisode: 2, currentSeason: undefined });
		expect(ti).toMatchObject({ totalEpisodes: 24, releaseDate: '2027-03-04' });
		expect(h.calls.some((c) => c.startsWith('updateAirtimeEntry'))).toBe(true);
		expect(h.calls.some((c) => c.startsWith('updateTitle'))).toBe(true);
	});
});

describe('tracker cards view', () => {
	const cardsWorld = () => newWorld({
		view: 'cards',
		titles: [title({ posterUrl: 'https://img.test/p.png' }), title({ id: 't2', title: 'Later' })],
		entries: [
			entry({ schedule: { recurrence: 'once', releaseDate: isoOffset(2) } }),
			entry({ id: 'e2', titleId: 't2', schedule: { recurrence: 'once', releaseDate: isoOffset(70) } }),
			entry({ id: 'e3', titleId: 't1', schedule: { recurrence: 'once' } }),
		],
	});

	it('groups cards by month, keeps undated entries last and shows the group counts', () => {
		const { container, tab } = makeTab(cardsWorld());
		tab.render();
		const titles = qsa(container, '.hoard-tracker__month-title');
		expect(titles.length).toBeGreaterThanOrEqual(2);
		expect(titles[titles.length - 1]!.textContent).toBe(`${t('airtime.noDate')}(1)`);
		expect(qsa(container, '.hoard-tracker__cell')).toHaveLength(3);
	});

	it('shows the empty states instead of a grid', () => {
		const empty = makeTab(newWorld({ view: 'cards' }));
		empty.tab.render();
		expect(empty.container.querySelector('.hoard-dashboard__empty-state')?.textContent).toBe(t('airtime.empty.tracker'));
		expect(empty.container.querySelector('.hoard-tracker__scroll')).toBeNull();
		const searched = makeTab(cardsWorld());
		searched.tab.searchQuery = 'zzz';
		searched.tab.render();
		expect(searched.container.querySelector('.hoard-dashboard__empty-state')?.textContent).toBe(t('airtime.empty.search'));
	});

	it('clicking a card opens the edit modal for its source', () => {
		const { container, tab } = makeTab(cardsWorld());
		tab.render();
		qsa(container, '.hoard-tracker__cell')[0]!.click();
		expect(cap.forms).toHaveLength(1);
	});
});
