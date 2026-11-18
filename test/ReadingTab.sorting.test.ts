import { newReadingTab } from './helpers/newReadingTab';
import { describe, expect, it, vi } from 'vitest';
import type { Book, Manga, ReadingCustomColumn } from '../src/shared/domain/types';
import { fakeSettings } from './helpers/fakeSettings';

const item = (id: string, customFields: Record<string, string | number> = {}, over: Partial<Book> = {}): Book =>
	({ id, title: id, author: '', status: 'Reading', rating: 0, releaseDate: null, customFields, ...over }) as unknown as Book;

const NUM: ReadingCustomColumn = { id: 'n', name: 'Page Score', type: 'number' } as ReadingCustomColumn;
const SEL: ReadingCustomColumn = { id: 's', name: 'Mood', type: 'select', options: ['happy', 'sad'] };

interface Internals {
	activeSubTab: string;
	sort: { key: string; dir: string; secondKey: string; secondDir: string };
	selectedIds: Set<string>;
	selectionMode: boolean;
	filters: { statusExclude: string[] };
	compareBySortKey: (a: Book | Manga, b: Book | Manga, key: string, factor: number, isBooks: boolean) => number;
	compareCustom: (a: Book | Manga, b: Book | Manga, col: string, factor: number) => number;
	searchFields: () => Array<{ name: string; label: string; text?: (i: Book) => string[]; number?: (i: Book) => number | null }>;
	buildSortPopover: (el: HTMLElement) => void;
	buildFilterPopover: (el: HTMLElement) => void;
	renderSelectionActionBar: (el: HTMLElement) => void;
	renderContent: () => void;
	render: () => void;
}

function build(sub: 'books' | 'manga' = 'books', columns: ReadingCustomColumn[] = [NUM, SEL]) {
	const reading = {
		onChange: () => {}, offChange: () => {},
		getSettings: () => ({ defaultSubTab: sub, statusColors: {} }),
		getBookColumns: () => columns,
		getMangaColumns: () => columns,
		getBook: vi.fn((id: string) => item(id)),
		getManga: vi.fn((id: string) => item(id)),
		updateBookSilent: vi.fn(),
		updateMangaSilent: vi.fn(),
		saveAndNotify: vi.fn(() => Promise.resolve()),
	};
	const tab = newReadingTab(document.createElement('div'), { reading, settings: fakeSettings({}) }) as unknown as Internals;
	tab.activeSubTab = sub;
	tab.renderContent = vi.fn();
	tab.render = vi.fn();
	return { tab, reading };
}

describe('ReadingTab custom-field sorting', () => {
	it('compares number columns numerically and honours the direction factor', () => {
		const { tab } = build();
		expect(tab.compareCustom(item('a', { n: 2 }), item('b', { n: 10 }), 'n', 1)).toBeLessThan(0);
		expect(tab.compareCustom(item('a', { n: 2 }), item('b', { n: 10 }), 'n', -1)).toBeGreaterThan(0);
	});

	it('compares text and select columns alphabetically', () => {
		const { tab } = build();
		expect(tab.compareCustom(item('a', { s: 'happy' }), item('b', { s: 'sad' }), 's', 1)).toBeLessThan(0);
	});

	it('sorts items without a value last, whatever the direction', () => {
		const { tab } = build();
		const empty = item('e');
		const full = item('f', { n: 1 });
		for (const factor of [1, -1]) {
			expect(tab.compareCustom(empty, full, 'n', factor)).toBe(1);
			expect(tab.compareCustom(full, empty, 'n', factor)).toBe(-1);
		}
		expect(tab.compareCustom(empty, item('g'), 'n', 1)).toBe(0);
	});
});

describe('ReadingTab.searchFields', () => {
	it('offers pages for books and chapters for manga', () => {
		expect(build('books').tab.searchFields().map((f) => f.name)).toContain('pages');
		expect(build('manga').tab.searchFields().map((f) => f.name)).toContain('chapters');
	});

	it('adds each custom column under a search-safe name and reads its value', () => {
		const { tab } = build('books');
		const field = tab.searchFields().find((f) => f.name === 'page-score')!;
		expect(field.label).toBe('Page Score');
		expect(field.text!(item('a', { n: 7 }))).toEqual(['7']);
		expect(field.text!(item('b'))).toEqual([]);
	});

	it('skips a column whose key collides with a built-in field', () => {
		const { tab } = build('books', [{ id: 'x', name: 'Title', type: 'text' } as ReadingCustomColumn]);
		expect(tab.searchFields().filter((f) => f.name === 'title')).toHaveLength(1);
	});
});

describe('ReadingTab sort popover', () => {
	it('lists custom columns and applies the picked key and direction', () => {
		const { tab } = build();
		const el = document.createElement('div');
		tab.buildSortPopover(el);
		const selects = el.querySelectorAll('select');
		expect(selects).toHaveLength(2);
		expect(Array.from(selects[0]!.options).map((o) => o.value)).toContain('custom:n');
		selects[0]!.value = 'custom:n';
		selects[0]!.dispatchEvent(new Event('change'));
		expect(tab.sort.key).toBe('custom:n');
		selects[1]!.value = 'custom:s';
		selects[1]!.dispatchEvent(new Event('change'));
		expect(tab.sort.secondKey).toBe('custom:s');
		const before = { dir: tab.sort.dir, second: tab.sort.secondDir };
		const dirs = el.querySelectorAll<HTMLElement>('.hoard-btn--sort-direction');
		dirs[0]!.click();
		dirs[1]!.click();
		expect(tab.sort.dir).not.toBe(before.dir);
		expect(tab.sort.secondDir).not.toBe(before.second);
		expect(tab.renderContent).toHaveBeenCalled();
	});
});

describe('ReadingTab multi-select filter section', () => {
	it('"All" unchecks every option, a second click checks them again', () => {
		const { tab } = build();
		const el = document.createElement('div');
		tab.buildFilterPopover(el);
		const allToggle = el.querySelector<HTMLElement>('.hoard-filter-panel__all-toggle')!;
		const boxes = () => Array.from(allToggle.closest('.hoard-filter-panel__checkbox-row')!.parentElement!.querySelectorAll<HTMLInputElement>('input')).slice(1);
		expect(boxes().length).toBeGreaterThan(0);
		allToggle.click();
		expect(boxes().every((b) => !b.checked)).toBe(true);
		allToggle.click();
		expect(boxes().every((b) => b.checked)).toBe(true);
	});
});

describe('ReadingTab selection action bar', () => {
	it('sets the picked status on every selected book and leaves selection mode', async () => {
		const { tab, reading } = build('books');
		tab.selectedIds = new Set(['a', 'b']);
		tab.selectionMode = true;
		const bar = document.createElement('div');
		tab.renderSelectionActionBar(bar);
		const select = bar.querySelector('select')!;
		select.value = 'Completed';
		select.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(tab.render).toHaveBeenCalled());
		expect(reading.updateBookSilent).toHaveBeenCalledTimes(2);
		expect(reading.updateBookSilent).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'Completed' }));
		expect(reading.saveAndNotify).toHaveBeenCalledOnce();
		expect(tab.selectionMode).toBe(false);
	});

	it('does the same for manga', async () => {
		const { tab, reading } = build('manga');
		tab.selectedIds = new Set(['m']);
		const bar = document.createElement('div');
		tab.renderSelectionActionBar(bar);
		const select = bar.querySelector('select')!;
		select.value = 'Completed';
		select.dispatchEvent(new Event('change'));
		await vi.waitFor(() => expect(tab.render).toHaveBeenCalled());
		expect(reading.updateMangaSilent).toHaveBeenCalledWith(expect.objectContaining({ id: 'm', status: 'Completed' }));
	});
});

describe('ReadingTab.compareBySortKey', () => {
	const lo = item('a', {}, { title: 'Alpha', author: 'Ann', rating: 1, status: 'Dropped', dateAdded: '2024-01-01', dateStarted: '2024-02-01', dateFinished: '2024-03-01', pagesRead: 10, totalPages: 100 });
	const hi = item('b', {}, { title: 'Beta', author: 'Bob', rating: 5, status: 'Reading', dateAdded: '2024-05-01', dateStarted: '2024-06-01', dateFinished: '2024-07-01', pagesRead: 90, totalPages: 100 });

	it.each(['title', 'author', 'rating', 'dateAdded', 'dateStarted', 'dateFinished', 'status', 'progress'])('orders by %s and flips with the factor', (key) => {
		const { tab } = build();
		expect(tab.compareBySortKey(lo, hi, key, 1, true)).toBeLessThan(0);
		expect(tab.compareBySortKey(lo, hi, key, -1, true)).toBeGreaterThan(0);
	});

	it('orders manga by progress', () => {
		const { tab } = build('manga');
		const a = { ...lo, chaptersRead: 1, totalChapters: 10 } as unknown as Manga;
		const b = { ...hi, chaptersRead: 9, totalChapters: 10 } as unknown as Manga;
		expect(tab.compareBySortKey(a, b, 'progress', 1, false)).toBeLessThan(0);
	});

	it('delegates custom keys and treats unknown keys as equal', () => {
		const { tab } = build();
		expect(tab.compareBySortKey(item('a', { n: 1 }), item('b', { n: 2 }), 'custom:n', 1, true)).toBeLessThan(0);
		expect(tab.compareBySortKey(lo, hi, 'none', 1, true)).toBe(0);
	});
});
