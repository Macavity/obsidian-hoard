import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Book, Game, Manga } from '../../src/types';
import { entry, isoOffset, makeTab, newWorld } from './airtimeTab.harness';

const cap = vi.hoisted(() => ({ readingModals: [] as unknown[][] }));
vi.mock('../../src/ReadingScheduleModal', () => ({ ReadingScheduleModal: class { constructor(...a: unknown[]) { cap.readingModals.push(a); } open(): void {} } }));
vi.mock('../../src/ConfirmModal', () => ({ ConfirmModal: class { open(): void {} } }));
vi.mock('../../src/MaybeAddModal', () => ({ MaybeAddModal: class { open(): void {} } }));
vi.mock('../../src/VirtualScroller', () => ({ VirtualScroller: class { addSection(): void {} attach(): void {} detach(): void {} destroy(): void {} } }));

const book = (over: Partial<Book> = {}): Book => ({ id: 'b1', title: 'Dune', totalChapters: 10, releaseDate: null, ...over }) as unknown as Book;
const manga = (over: Partial<Manga> = {}): Manga => ({ id: 'm1', title: 'Berserk', totalChapters: 1, totalVolumes: 1, releaseDate: null, ...over }) as unknown as Manga;
const game = (over: Partial<Game> = {}): Game => ({ id: 'g1', title: 'Hades', releaseDate: null, ...over }) as unknown as Game;

type Priv = {
	syncReadingItemFromSchedule: (id: string, kind: 'book' | 'manga', s: unknown, v: number | null, c: number | null) => Promise<void>;
	syncGameFromSchedule: (id: string, s: unknown) => Promise<void>;
	renderMaybe: () => void;
	handleTrackerCardsVisible: (cells: HTMLElement[]) => void;
};

afterEach(() => document.body.replaceChildren());

const once = (d: string) => ({ recurrence: 'once' as const, releaseDate: d });

describe('syncReadingItemFromSchedule', () => {
	it('writes totals and a future date back to a book, once', async () => {
		const b = book();
		const { tab, calls } = makeTab(newWorld({ books: [b] }));
		const p = tab as unknown as Priv;
		const future = isoOffset(5);
		await p.syncReadingItemFromSchedule('b1', 'book', once(future), null, 40);
		expect(b.totalChapters).toBe(40);
		expect(b.releaseDate).toBe(future);
		expect(calls.filter((c) => c.startsWith('updateBook'))).toHaveLength(1);
		await p.syncReadingItemFromSchedule('b1', 'book', once(future), null, 40);
		expect(calls.filter((c) => c.startsWith('updateBook'))).toHaveLength(1);
	});

	it('ignores a past date and a missing book', async () => {
		const b = book();
		const { tab, calls } = makeTab(newWorld({ books: [b] }));
		const p = tab as unknown as Priv;
		await p.syncReadingItemFromSchedule('b1', 'book', once(isoOffset(-3)), null, null);
		await p.syncReadingItemFromSchedule('nope', 'book', once(isoOffset(3)), null, 5);
		expect(calls).toEqual([]);
		expect(b.releaseDate).toBeNull();
	});

	it('writes volumes, chapters and a future date back to a manga', async () => {
		const m = manga();
		const { tab, calls } = makeTab(newWorld({ manga: [m] }));
		const p = tab as unknown as Priv;
		const future = isoOffset(9);
		await p.syncReadingItemFromSchedule('m1', 'manga', once(future), 12, 100);
		expect([m.totalVolumes, m.totalChapters, m.releaseDate]).toEqual([12, 100, future]);
		expect(calls.filter((c) => c.startsWith('updateManga'))).toHaveLength(1);
		await p.syncReadingItemFromSchedule('m1', 'manga', once(future), 12, 100);
		await p.syncReadingItemFromSchedule('nope', 'manga', once(future), 1, 1);
		expect(calls.filter((c) => c.startsWith('updateManga'))).toHaveLength(1);
	});

	it('leaves a manga with a past date untouched', async () => {
		const { tab, calls } = makeTab(newWorld({ manga: [manga()] }));
		await (tab as unknown as Priv).syncReadingItemFromSchedule('m1', 'manga', once(isoOffset(-1)), null, null);
		expect(calls).toEqual([]);
	});
});

describe('syncGameFromSchedule', () => {
	it('pushes a future release date onto the game once', async () => {
		const g = game();
		const { tab, calls } = makeTab(newWorld({ games: [g] }));
		const p = tab as unknown as Priv;
		const future = isoOffset(4);
		await p.syncGameFromSchedule('g1', once(future));
		await p.syncGameFromSchedule('g1', once(future));
		expect(g.releaseDate).toBe(future);
		expect(calls.filter((c) => c.startsWith('updateGame'))).toHaveLength(1);
	});

	it('ignores past dates, recurring schedules and missing games', async () => {
		const { tab, calls } = makeTab(newWorld({ games: [game()] }));
		const p = tab as unknown as Priv;
		await p.syncGameFromSchedule('g1', once(isoOffset(-2)));
		await p.syncGameFromSchedule('g1', { recurrence: 'daily' });
		await p.syncGameFromSchedule('nope', once(isoOffset(2)));
		expect(calls).toEqual([]);
	});
});

describe('maybe list ordering', () => {
	it('sorts dated entries first by date, undated ones by date added', () => {
		const w = newWorld();
		const { tab, container, dm } = makeTab(w);
		(dm as unknown as { getMaybeTitles: () => unknown[] }).getMaybeTitles = () => [
			{ id: 'u2', title: 'Undated late', type: 'Anime', releaseDate: null, dateAdded: '2026-02-01' },
			{ id: 'd2', title: 'Dated late', type: 'Anime', releaseDate: isoOffset(20), dateAdded: '2026-01-01' },
			{ id: 'u1', title: 'Undated early', type: 'Anime', releaseDate: null, dateAdded: '2026-01-01' },
			{ id: 'd1', title: 'Dated soon', type: 'Anime', releaseDate: isoOffset(2), dateAdded: '2026-01-05' },
		];
		(tab as unknown as Priv).renderMaybe();
		const titles = Array.from(container.querySelectorAll('.hoard-maybe-card__title')).map((e) => e.textContent);
		expect(titles).toEqual(['Dated soon', 'Dated late', 'Undated early', 'Undated late']);
	});
});

describe('handleTrackerCardsVisible', () => {
	const cell = (titleId?: string): HTMLElement => {
		const c = document.createElement('div');
		if (titleId) c.dataset.titleId = titleId;
		const card = document.createElement('div');
		card.className = 'hoard-card';
		const img = document.createElement('img');
		img.className = 'hoard-card__poster';
		const ph = document.createElement('div');
		ph.className = 'hoard-card__poster-placeholder';
		card.append(img, ph);
		c.append(card);
		return c;
	};

	it('fetches a poster for titles without one and wires the image', async () => {
		const w = newWorld({ titles: [{ id: 't1', title: 'Show', posterUrl: '' } as never, { id: 't2', title: 'Has', posterUrl: 'x' } as never] });
		const { tab, plugin, calls } = makeTab(w);
		const enqueue = vi.fn((t: { id: string }) => Promise.resolve(t.id === 't1' ? 'http://img/1.png' : ''));
		(plugin.posterService as { enqueue: unknown }).enqueue = enqueue;
		const fetched = cell('t1');
		const skipped = cell('t2');
		const unknownTitle = cell('zzz');
		const noId = cell();
		(tab as unknown as Priv).handleTrackerCardsVisible([noId, unknownTitle, skipped, fetched]);
		expect(enqueue).toHaveBeenCalledTimes(1);
		expect(fetched.querySelector('.hoard-card__poster-placeholder')!.classList.contains('is-loading')).toBe(true);
		await Promise.resolve();
		await Promise.resolve();
		const img = fetched.querySelector<HTMLImageElement>('.hoard-card__poster')!;
		expect(img.src).toContain('img/1.png');
		expect(fetched.querySelector('.hoard-card__poster-placeholder')!.classList.contains('is-loading')).toBe(false);
		img.onload!(new Event('load'));
		expect(fetched.querySelector('.hoard-card')!.classList.contains('has-poster')).toBe(true);
		img.onerror!(new Event('error'));
		expect(calls.some((c) => c.startsWith('updatePosterUrl:["t1","none"]'))).toBe(true);
	});

	it('does nothing visible when no poster is found', async () => {
		const w = newWorld({ titles: [{ id: 't1', title: 'Show', posterUrl: '' } as never] });
		const { tab } = makeTab(w);
		const c = cell('t1');
		(tab as unknown as Priv).handleTrackerCardsVisible([c]);
		await Promise.resolve();
		await Promise.resolve();
		expect(c.querySelector('.hoard-card__poster-placeholder')!.classList.contains('is-loading')).toBe(false);
		expect(c.querySelector<HTMLImageElement>('.hoard-card__poster')!.getAttribute('src')).toBeNull();
	});
});

describe('edit reading schedule save', () => {
	it('stores the schedule on the entry and syncs the totals back', async () => {
		const b = book();
		const e = entry({ titleId: 'b1', source: 'reading', readingKind: 'book' });
		const { tab, calls } = makeTab(newWorld({ books: [b], entries: [e] }));
		(tab as unknown as { openEditReadingSchedule: (e: unknown) => void }).openEditReadingSchedule(e);
		const save = cap.readingModals[0]![8] as (...a: unknown[]) => Promise<void>;
		await save(once(isoOffset(6)), 2, 7, null, 55);
		expect(e.currentEpisode).toBe(7);
		expect(b.totalChapters).toBe(55);
		expect(calls.some((c) => c.startsWith('updateAirtimeEntry'))).toBe(true);
	});
});
