import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from '../__mocks__/obsidian';
import { t } from '../../src/i18n';
import { statusLabel } from '../../src/i18n/labels';
import { DEFAULT_SETTINGS, GAME_AUTO_STATUS } from '../../src/types';
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

describe('resolveEntry', () => {
	it('resolves a watchlist title, colouring the badge only when enabled', () => {
		const w = newWorld({ titles: [title({ totalEpisodes: 12 })], colored: true });
		const { priv } = makeTab(w);
		const r = priv.resolveEntry(entry({ schedule: { recurrence: 'weekly', dayOfWeek: 1 } })) as Record<string, unknown>;
		expect(r).toMatchObject({
			source: 'watchlist', id: 't1', title: 'Show', typeName: 'Anime', isSingle: false, totalUnits: 12,
			unit: 'episode', group: 'season', next: 'nextWatch', planStatus: 'Plan to watch', externalLink: 'https://example.test/show',
		});
		expect(typeof r.typeColor).toBe('string');
		const plain = makeTab(newWorld({ titles: [title()] })).priv.resolveEntry(entry()) as Record<string, unknown>;
		expect(plain.typeColor).toBeNull();
	});

	it('treats a one-off schedule as single and prefers the entry total', () => {
		const { priv } = makeTab(newWorld({ titles: [title()] }));
		const r = priv.resolveEntry(entry({ schedule: { recurrence: 'once', releaseDate: isoOffset(3) }, totalEpisodes: 3 })) as Record<string, unknown>;
		expect(r).toMatchObject({ isSingle: true, totalUnits: 3 });
	});

	it('resolves books and manga as chapters grouped by volume', () => {
		const { priv } = makeTab(newWorld({ books: [book()], manga: [manga()], colored: true }));
		const b = priv.resolveEntry(entry({ titleId: 'b1', source: 'reading', readingKind: 'book' })) as Record<string, unknown>;
		expect(b).toMatchObject({
			source: 'reading', typeName: 'Book', unit: 'chapter', group: 'volume', next: 'nextReading',
			planStatus: 'Plan to Read', totalUnits: 40, externalLink: 'b-link', isSingle: false,
			typeColor: DEFAULT_SETTINGS.readingTypeColors.book,
		});
		const m = priv.resolveEntry(entry({ titleId: 'm1', source: 'reading', readingKind: 'manga', totalEpisodes: 5, schedule: { recurrence: 'once' } })) as Record<string, unknown>;
		expect(m).toMatchObject({ typeName: 'Manga', totalUnits: 5, isSingle: true, externalLink: '' });
		const defaulted = priv.resolveEntry(entry({ titleId: 'b1', source: 'reading' })) as Record<string, unknown>;
		expect(defaulted.typeName).toBe('Book');
		const plain = makeTab(newWorld({ books: [book()] })).priv.resolveEntry(entry({ titleId: 'b1', source: 'reading' })) as Record<string, unknown>;
		expect(plain.typeColor).toBeNull();
	});

	it('resolves games as single releases, store page first', () => {
		const { priv } = makeTab(newWorld({ games: [game({ storeUrl: 'store' }), game({ id: 'g2', storeUrl: '' })] }));
		const g = priv.resolveEntry(entry({ titleId: 'g1', source: 'game' })) as Record<string, unknown>;
		expect(g).toMatchObject({
			source: 'game', typeName: 'Game', isSingle: true, unit: 'release', totalUnits: 0, externalLink: 'store',
			planStatus: 'Not started', typeColor: null,
		});
		expect((priv.resolveEntry(entry({ titleId: 'g2', source: 'game' })) as Record<string, unknown>).externalLink).toBe('g-link');
	});

	it('returns null for orphans of every source', () => {
		const { priv } = makeTab(newWorld());
		expect(priv.resolveEntry(entry({ titleId: 'x' }))).toBeNull();
		expect(priv.resolveEntry(entry({ titleId: 'x', source: 'reading', readingKind: 'manga' }))).toBeNull();
		expect(priv.resolveEntry(entry({ titleId: 'x', source: 'reading' }))).toBeNull();
		expect(priv.resolveEntry(entry({ titleId: 'x', source: 'game' }))).toBeNull();
	});
});

describe('tracker header', () => {
	it('counts only resolvable entries and toggles selection mode', () => {
		const w = newWorld({ titles: [title()], entries: [entry(), entry({ id: 'e2', titleId: 'gone' })] });
		const { container, tab } = makeTab(w);
		tab.render();
		expect(container.querySelector('.hoard-list-count')?.textContent).toBe('1');
		expect(container.querySelector('.hoard-action-bar')).toBeNull();
		const select = qsa<HTMLButtonElement>(container, '.hoard-header-controls-right button')[0]!;
		select.click();
		expect(tab.selectionMode).toBe(true);
		expect(container.querySelector('.hoard-airtime-select-cb')).not.toBeNull();
	});

	it('hides the count when nothing resolves', () => {
		const { container, tab } = makeTab(newWorld({ entries: [entry()] }));
		tab.render();
		expect(container.querySelector('.hoard-list-count')).toBeNull();
	});

	it('select-all picks every entry, then clears; selected items show the action bar', async () => {
		const w = newWorld({ titles: [title()], entries: [entry(), entry({ id: 'e2' })] });
		const { container, tab, calls } = makeTab(w);
		tab.selectionMode = true;
		tab.render();
		const selectAll = (): HTMLElement => container.querySelector<HTMLElement>('.hoard-header-controls > :first-child')!;
		selectAll().click();
		expect([...tab.selectedItems]).toEqual(['e1', 'e2']);
		expect(container.querySelector('.hoard-action-bar')).not.toBeNull();
		container.querySelector<HTMLElement>('.hoard-action-bar button')!.click();
		expect(cap.confirms[0]!.message).toBe(t('airtime.confirm.removeSelected', { count: 2 }));
		cap.confirms[0]!.onConfirm();
		await Promise.resolve();
		await Promise.resolve();
		expect(calls).toContain('removeBatch:[["e1","e2"]]');
		expect(tab.selectedItems.size).toBe(0);
	});

	it('clearing the selection through the first control', () => {
		const w = newWorld({ titles: [title()], entries: [entry()] });
		const { container, tab } = makeTab(w);
		tab.selectionMode = true;
		tab.selectedItems.add('e1');
		tab.render();
		container.querySelector<HTMLElement>('.hoard-header-controls > :nth-child(2)')!.click();
		expect(tab.selectedItems.size).toBe(0);
	});

	it('add button opens the add flow without bubbling', () => {
		const { container, tab } = makeTab(newWorld());
		tab.render();
		container.querySelector<HTMLElement>('.hoard-add-btn')!.click();
		expect(Notice.shown).toEqual([t('airtime.notices.noTitles')]);
	});
});

describe('tick flow', () => {
	const tickBtn = (c: HTMLElement): HTMLButtonElement => c.querySelector<HTMLButtonElement>('.hoard-airtime-action-btn-tick')!;

	it('final episode: final wording, removes the entry', async () => {
		const w = newWorld({ titles: [title({ totalEpisodes: 12 })], entries: [entry({ currentEpisode: 12 })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		expect(tickBtn(container).classList.contains('hoard-icon-btn')).toBe(true);
		expect(tickBtn(container).getAttribute('data-icon')).toBe('check');
		expect(tickBtn(container).getAttribute('aria-label')).toBe(t('airtime.actions.finalEpisode'));
		tickBtn(container).click();
		expect(cap.confirms[0]!.message).toBe(t('airtime.confirm.episode.final', { title: 'Show', n: 12 }));
		expect(cap.confirms[0]!.extra).toBeUndefined();
		cap.confirms[0]!.onConfirm();
		await vi.waitFor(() => expect(calls.some((c) => c.startsWith('removeAirtimeEntry'))).toBe(true));
		expect(calls.some((c) => c.startsWith('markAirtimeHandled:["e1-'))).toBe(true);
		expect(calls.some((c) => c.startsWith('tickAirtimeEntry'))).toBe(false);
	});

	it('mid-series: next/out wording and a tick that acknowledges today', async () => {
		const w = newWorld({ titles: [title()], entries: [entry({ currentEpisode: 3 })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		expect(tickBtn(container).getAttribute('aria-label')).toBe(t('airtime.actions.markEpisode'));
		tickBtn(container).click();
		expect(cap.confirms[0]!.message).toBe(t('airtime.confirm.episode.next', { title: 'Show', n: 3 }));
		w.tracked = true;
		tickBtn(container).click();
		expect(cap.confirms[1]!.message).toBe(t('airtime.confirm.episode.out', { title: 'Show', n: 3 }));
		cap.confirms[1]!.onConfirm();
		await vi.waitFor(() => expect(calls.some((c) => c.startsWith('tickAirtimeEntry'))).toBe(true));
	});

	it('chapters use the chapter wording', () => {
		const w = newWorld({
			manga: [manga()],
			entries: [entry({ titleId: 'm1', source: 'reading', readingKind: 'manga', currentEpisode: 364 }), entry({ id: 'e2', titleId: 'm1', source: 'reading', readingKind: 'manga', currentEpisode: 2 })],
		});
		const { container, tab } = makeTab(w);
		tab.render();
		const [final, mid] = qsa<HTMLButtonElement>(container, '.hoard-airtime-action-btn-tick');
		expect(final!.getAttribute('aria-label')).toBe(t('airtime.actions.finalChapter'));
		expect(mid!.getAttribute('aria-label')).toBe(t('airtime.actions.markChapter'));
		mid!.click();
		expect(cap.confirms[0]!.message).toBe(t('airtime.confirm.chapter.next', { title: 'Berserk', n: 2 }));
		final!.click();
		expect(cap.confirms[1]!.message).toBe(t('airtime.confirm.chapter.final', { title: 'Berserk', n: 364 }));
	});

	it('a due single release reverts the auto status and offers the recurring switch', async () => {
		const t1 = title({ status: 'To be released' });
		const w = newWorld({ titles: [t1], entries: [entry({ schedule: { recurrence: 'once', releaseDate: isoOffset(-1) } })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		expect(tickBtn(container).getAttribute('aria-label')).toBe(t('airtime.actions.markReleased'));
		tickBtn(container).click();
		const c = cap.confirms[0]!;
		expect(c.message).toBe(t('airtime.confirm.released', { title: 'Show', status: statusLabel('Plan to watch') }));
		expect(c.extra!.label).toBe(t('airtime.actions.switchEpisodes'));
		c.onConfirm();
		await vi.waitFor(() => expect(t1.status).toBe('Plan to watch'));
		expect(calls.some((x) => x.startsWith('removeAirtimeEntry'))).toBe(true);
		expect(calls.some((x) => x.startsWith('updateTitle'))).toBe(true);
		c.extra!.onClick();
		expect(cap.forms).toHaveLength(1);
	});

	it('a derived premiere card keeps the entry when its removal clears the release date', async () => {
		const w = newWorld({ titles: [title()], clearsDate: true, entries: [entry({ schedule: { recurrence: 'once', releaseDate: isoOffset(-1) } })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		tickBtn(container).click();
		cap.confirms[0]!.onConfirm();
		await vi.waitFor(() => expect(calls.some((x) => x.startsWith('markAirtimeHandled'))).toBe(true));
		await Promise.resolve();
		expect(calls.some((x) => x.startsWith('removeAirtimeEntry'))).toBe(false);
	});

	it('single reading release offers the chapter switch and reverts the reading status', async () => {
		const b = book({ status: 'To be released' });
		const w = newWorld({ books: [b], entries: [entry({ titleId: 'b1', source: 'reading', readingKind: 'book', schedule: { recurrence: 'once', releaseDate: isoOffset(-2) } })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		tickBtn(container).click();
		const c = cap.confirms[0]!;
		expect(c.extra!.label).toBe(t('airtime.actions.switchChapters'));
		c.extra!.onClick();
		expect(cap.readingModals).toHaveLength(1);
		expect(cap.readingModals[0]!.at(-1)).toBe('recurring');
		c.onConfirm();
		await vi.waitFor(() => expect(b.status).toBe('Plan to Read'));
		expect(calls.some((x) => x.startsWith('updateBook'))).toBe(true);
	});

	it('a due game has no switch button and reverts to the default status', async () => {
		const g = game({ status: GAME_AUTO_STATUS });
		const w = newWorld({ games: [g], entries: [entry({ titleId: 'g1', source: 'game', schedule: { recurrence: 'once', releaseDate: isoOffset(-2) } })] });
		const { container, tab, calls } = makeTab(w);
		tab.render();
		tickBtn(container).click();
		const c = cap.confirms[0]!;
		expect(c.extra).toBeUndefined();
		c.onConfirm();
		await vi.waitFor(() => expect(g.status).toBe('Not started'));
		expect(calls.some((x) => x.startsWith('updateGame'))).toBe(true);
	});
});
