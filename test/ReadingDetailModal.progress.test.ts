import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingDetailModal } from '../src/ReadingDetailModal';
import { readingStatusLabel } from '../src/i18n/labels';
import { deriveBorderColor, deriveFillColor } from '../src/ColorPicker';
import { t } from '../src/i18n';
import { DEFAULT_FIELD_COLOR, formatCount, todayIso } from '../src/types';
import type { Book, Manga, ReadingCustomColumn } from '../src/types';

// the shared DOM polyfills lack createSvg, which the arc gauges draw with
const svgProto = Element.prototype as unknown as { createSvg?: (tag: string) => SVGElement };
svgProto.createSvg ??= function (this: Element, tag: string): SVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	this.appendChild(el);
	return el;
};

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const baseBook = (over: Partial<Book> = {}): Book => ({
	id: 'b1', title: 'Dune', author: 'Herbert', status: 'Reading', rating: 0, progressUnit: 'pages',
	pagesRead: 0, totalPages: 0, wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0,
	coverUrl: '', googleBooksId: '', vaultPage: '', externalLink: '', dateAdded: '', customFields: {}, ...over,
} as unknown as Book);
const baseManga = (over: Partial<Manga> = {}): Manga => ({
	id: 'm1', title: 'Berserk', author: 'Miura', status: 'Reading', rating: 0, chaptersRead: 0, totalChapters: 0,
	volumesRead: 0, totalVolumes: 0, coverUrl: '', malId: '', vaultPage: '', externalLink: '', dateAdded: '',
	customFields: {}, ...over,
} as unknown as Manga);

interface Opts {
	mode?: 'book' | 'manga';
	item?: Book | Manga;
	showHints?: boolean;
	settings?: Record<string, unknown>;
}

/** Builds a modal over a stateful item store, so saved changes are visible to later reads. */
function build(o: Opts = {}) {
	const mode = o.mode ?? 'book';
	const store: { item: Book | Manga | undefined } = {
		item: o.item ?? (mode === 'book' ? baseBook() : baseManga()),
	};
	const readingData = {
		getBook: vi.fn(() => store.item as Book | undefined),
		getManga: vi.fn(() => store.item as Manga | undefined),
		updateBook: vi.fn((b: Book) => { store.item = b; return Promise.resolve(); }),
		updateManga: vi.fn((m: Manga) => { store.item = m; return Promise.resolve(); }),
		setCustomField: vi.fn(() => Promise.resolve()),
		getSettings: vi.fn(() => o.settings ?? {}),
	};
	const log = vi.fn(() => Promise.resolve());
	const apiService = {
		hasGoogleBooksKey: () => true,
		getGoogleBookById: vi.fn(() => Promise.resolve({ coverUrl: 'http://c/n.jpg' })),
		getMangaByMalId: vi.fn(() => Promise.resolve({ coverUrl: 'http://c/m.jpg' })),
	};
	const plugin = {
		settings: { showHintBanners: o.showHints ?? false },
		apiService,
		historyManager: { log },
		app: {},
	};
	const onChanged = vi.fn();
	const modal = new ReadingDetailModal({} as never, plugin as never, readingData as never, mode, 'x', onChanged);
	const x = modal as unknown as {
		contentEl: HTMLElement;
		close: () => void;
		renderProgressSection: (item: Book | Manga) => void;
		renderStatusBadge: (wrap: HTMLElement) => void;
		renderCustomFieldRow: (parent: HTMLElement, item: Book | Manga, col: ReadingCustomColumn) => void;
		resolveItemLink: (item: Book | Manga) => string;
		renderIdCell: (grid: HTMLElement, item: Book | Manga) => void;
		commitDraft: () => Promise<void>;
	};
	return { modal: x, store, readingData, apiService, onChanged, log };
}

type Built = ReturnType<typeof build>;

/** Renders the progress section and returns its gauge columns. */
function renderGauges(b: Built) {
	b.modal.renderProgressSection(b.store.item!);
	return Array.from(b.modal.contentEl.querySelectorAll<HTMLElement>('.hoard-reading-detail__arc-column'));
}

const buttons = (col: HTMLElement) => col.querySelectorAll<HTMLButtonElement>('.hoard-reading-detail__step-btn');
const inc = (col: HTMLElement, times = 1) => { for (let i = 0; i < times; i++) buttons(col)[1]!.click(); };
const dec = (col: HTMLElement) => buttons(col)[0]!.click();
const field = (col: HTMLElement) => col.querySelector<HTMLInputElement>('.hoard-reading-detail__arc-input')!;
const type = (col: HTMLElement, value: string) => {
	const input = field(col);
	input.value = value;
	input.dispatchEvent(new Event('input'));
	return input;
};

afterEach(() => { vi.restoreAllMocks(); });

describe('ReadingDetailModal.renderProgressSection', () => {
	it('renders a pages and a chapters gauge plus the unit toggle for books', () => {
		const b = build({ item: baseBook({ totalPages: 200, pagesRead: 50, totalChapters: 10 }) });
		const cols = renderGauges(b);
		expect(cols).toHaveLength(2);
		expect(b.modal.contentEl.querySelector('.hoard-reading-modal__section-label--row')).not.toBeNull();
		expect(cols[0]!.textContent).toContain('25%');
		expect(cols[0]!.textContent).toContain(t('reading.card.units.pages'));
		expect(cols[1]!.textContent).toContain(t('detail.reading.unitChapters'));
		expect(field(cols[0]!).value).toBe('50');
		expect(field(cols[0]!).getAttribute('max')).toBe('200');
		expect(buttons(cols[0]!)[0]!.textContent).toBe('−1');
	});

	it('follows the words unit with coarse steps', () => {
		const b = build({ item: baseBook({ progressUnit: 'words', totalWords: 5000, wordsRead: 500 }) });
		const cols = renderGauges(b);
		expect(cols[0]!.classList.contains('hoard-reading-detail__arc-column--wide')).toBe(true);
		expect(cols[0]!.textContent).toContain(t('reading.card.units.words'));
		expect(buttons(cols[0]!)[1]!.textContent).toBe('+100');
		expect(cols[1]!.classList.contains('hoard-reading-detail__arc-column--wide')).toBe(false);
	});

	it('renders chapters and volumes gauges without a toggle for manga', () => {
		const b = build({ mode: 'manga', item: baseManga({ totalChapters: 4, chaptersRead: 1, totalVolumes: 2 }) });
		const cols = renderGauges(b);
		expect(cols).toHaveLength(2);
		expect(b.modal.contentEl.querySelector('.hoard-reading-modal__section-label--row')).toBeNull();
		expect(cols[0]!.textContent).toContain('25%');
		expect(cols[1]!.textContent).toContain(t('detail.reading.unitVolumes'));
	});

	it('shows the total hint banner only when hint banners are enabled', () => {
		const off = build();
		renderGauges(off);
		expect(off.modal.contentEl.querySelector('.hoard-custom-lists__draft-banner')).toBeNull();

		const book = build({ showHints: true });
		renderGauges(book);
		expect(book.modal.contentEl.querySelector('.hoard-custom-lists__draft-banner')!.textContent).toBe(
			`⚠ ${t('detail.reading.totalHint', { primary: t('reading.card.units.pages'), secondary: t('detail.reading.unitChapters') })}`,
		);

		const words = build({ showHints: true, item: baseBook({ progressUnit: 'words' }) });
		renderGauges(words);
		expect(words.modal.contentEl.querySelector('.hoard-custom-lists__draft-banner')!.textContent).toContain(t('reading.card.units.words'));

		const manga = build({ mode: 'manga', showHints: true });
		renderGauges(manga);
		expect(manga.modal.contentEl.querySelector('.hoard-custom-lists__draft-banner')!.textContent).toContain(t('detail.reading.unitVolumes'));
	});
});

describe('ReadingDetailModal gauge clamp', () => {
	it('caps typed and stepped values at the total', () => {
		const b = build({ item: baseBook({ totalPages: 10 }) });
		const [pages] = renderGauges(b);
		type(pages!, '99');
		expect(field(pages!).value).toBe('10');
		inc(pages!);
		expect(field(pages!).value).toBe('10');
	});

	it('floors negative and non-numeric input at zero', () => {
		const b = build({ item: baseBook({ totalPages: 10, pagesRead: 4 }) });
		const [pages] = renderGauges(b);
		type(pages!, '-5');
		expect(field(pages!).value).toBe('0');
		type(pages!, '7');
		expect(field(pages!).value).toBe('7');
		type(pages!, 'abc');
		expect(field(pages!).value).toBe('0');
		dec(pages!);
		expect(field(pages!).value).toBe('0');
	});

	it('does not cap at all while the total is unknown', () => {
		const b = build();
		const [pages] = renderGauges(b);
		type(pages!, '1234');
		inc(pages!);
		expect(field(pages!).value).toBe('1235');
		expect(pages!.textContent).toContain('0%');
	});
});

describe('ReadingDetailModal.commitOnClose', () => {
	it('saves nothing when the counters were not touched', async () => {
		const b = build({ item: baseBook({ totalPages: 10 }) });
		renderGauges(b);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
		expect(b.onChanged).not.toHaveBeenCalled();
	});

	it('saves nothing when the item vanished meanwhile', async () => {
		const b = build({ item: baseBook({ totalPages: 10 }) });
		const [pages] = renderGauges(b);
		inc(pages!);
		b.store.item = undefined;
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
		expect(b.onChanged).not.toHaveBeenCalled();
	});

	it('persists the book draft and keeps an unfinished book running', async () => {
		const b = build({ item: baseBook({ totalPages: 10, totalChapters: 5 }) });
		const [pages, chapters] = renderGauges(b);
		inc(pages!, 3);
		inc(chapters!, 2);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({
			id: 'b1', pagesRead: 3, chaptersRead: 2, status: 'Reading',
		}));
		expect(b.onChanged).toHaveBeenCalledTimes(1);
		expect((b.store.item as Book).dateFinished).toBeUndefined();
	});

	it('completes a book that reached its page total and stamps the finish date', async () => {
		const b = build({ item: baseBook({ totalPages: 3 }) });
		const [pages] = renderGauges(b);
		inc(pages!, 3);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({
			status: 'Completed', pagesRead: 3, dateFinished: todayIso(),
		}));
	});

	it('completes a book by chapters even when pages are open', async () => {
		const b = build({ item: baseBook({ totalPages: 100, totalChapters: 2, chaptersRead: 1 }) });
		const [, chapters] = renderGauges(b);
		inc(chapters!);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Completed', chaptersRead: 2 }));
	});

	it('ignores a stale page count when the book is tracked in words', async () => {
		const b = build({
			item: baseBook({ progressUnit: 'words', totalPages: 5, pagesRead: 5, totalWords: 1000, wordsRead: 0 }),
		});
		const [words] = renderGauges(b);
		inc(words!);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Reading', wordsRead: 100 }));
	});

	it('completes a words book once the word total is reached', async () => {
		const b = build({ item: baseBook({ progressUnit: 'words', totalWords: 200 }) });
		const [words] = renderGauges(b);
		inc(words!, 2);
		b.modal.close();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Completed', wordsRead: 200 }));
	});

	it('stamps a missing finish date on an already completed item but keeps an existing one', async () => {
		const open = build({ item: baseBook({ status: 'Completed' }) });
		inc(renderGauges(open)[0]!);
		open.modal.close();
		await flush();
		expect(open.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ dateFinished: todayIso() }));

		const done = build({ item: baseBook({ status: 'Completed', dateFinished: '2020-01-01' }) });
		inc(renderGauges(done)[0]!);
		done.modal.close();
		await flush();
		expect(done.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ dateFinished: '2020-01-01' }));
	});

	it('persists manga progress and completes it by chapters', async () => {
		const b = build({ mode: 'manga', item: baseManga({ totalChapters: 2, totalVolumes: 9 }) });
		const [chapters, volumes] = renderGauges(b);
		inc(chapters!, 2);
		inc(volumes!);
		b.modal.close();
		await flush();
		expect(b.readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({
			id: 'm1', chaptersRead: 2, volumesRead: 1, status: 'Completed',
		}));
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
		expect(b.onChanged).toHaveBeenCalledTimes(1);
	});

	it('keeps manga running while chapters are open', async () => {
		const b = build({ mode: 'manga', item: baseManga({ totalChapters: 5 }) });
		const [, volumes] = renderGauges(b);
		inc(volumes!);
		b.modal.close();
		await flush();
		expect(b.readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ status: 'Reading', volumesRead: 1 }));
	});
});

describe('ReadingDetailModal.logProgressChange', () => {
	const closeAfter = async (b: Built, edit: (cols: HTMLElement[]) => void) => {
		edit(renderGauges(b));
		b.modal.close();
		await flush();
	};
	const logged = (b: Built) => (b.log.mock.calls as unknown[][]).map((c) => c[0]);

	it('logs the page position of a pages book', async () => {
		const b = build({ item: baseBook({ totalPages: 1200 }) });
		await closeAfter(b, (c) => inc(c[0]!, 2));
		expect(logged(b)).toEqual([`Dune (Book) At page 2 / ${formatCount(1200)}`]);
		expect(b.log).toHaveBeenCalledWith(expect.any(String), {
			source: 'Reading', action: 'watched', titleName: 'Dune', titleId: 'b1',
		});
	});

	it('logs the word position of a words book and ignores pages', async () => {
		const b = build({ item: baseBook({ progressUnit: 'words', totalWords: 5000, totalPages: 10 }) });
		await closeAfter(b, (c) => inc(c[0]!));
		expect(logged(b)).toEqual([`Dune (Book) At word 100 / ${formatCount(5000)}`]);
	});

	it('logs chapter progress of a book alongside pages', async () => {
		const b = build({ item: baseBook({ totalPages: 10, totalChapters: 4 }) });
		await closeAfter(b, (c) => { inc(c[0]!); inc(c[1]!); });
		expect(logged(b)).toEqual(['Dune (Book) At page 1 / 10', 'Dune (Book) At chapter 1 / 4']);
	});

	it('skips units without a total', async () => {
		const pages = build();
		await closeAfter(pages, (c) => { inc(c[0]!); inc(c[1]!); });
		expect(pages.log).not.toHaveBeenCalled();
		const words = build({ item: baseBook({ progressUnit: 'words' }) });
		await closeAfter(words, (c) => inc(c[0]!));
		expect(words.log).not.toHaveBeenCalled();
	});

	it('skips units that did not change', async () => {
		const b = build({ item: baseBook({ totalPages: 10, totalChapters: 4 }) });
		await closeAfter(b, (c) => inc(c[1]!));
		expect(logged(b)).toEqual(['Dune (Book) At chapter 1 / 4']);
	});

	it('logs manga chapters and volumes', async () => {
		const b = build({ mode: 'manga', item: baseManga({ totalChapters: 50, totalVolumes: 5 }) });
		await closeAfter(b, (c) => { inc(c[0]!, 3); inc(c[1]!); });
		expect(logged(b)).toEqual(['Berserk (Manga) At chapter 3 / 50', 'Berserk (Manga) At volume 1 / 5']);
	});

	it('skips manga counters without totals or changes', async () => {
		const none = build({ mode: 'manga' });
		await closeAfter(none, (c) => { inc(c[0]!); inc(c[1]!); });
		expect(none.log).not.toHaveBeenCalled();
		const one = build({ mode: 'manga', item: baseManga({ totalChapters: 5, totalVolumes: 2 }) });
		await closeAfter(one, (c) => inc(c[1]!));
		expect(logged(one)).toEqual(['Berserk (Manga) At volume 1 / 2']);
	});

	it('does not fail without a history manager', async () => {
		const b = build({ item: baseBook({ totalPages: 10 }) });
		const plugin = (b.modal as unknown as { plugin: { historyManager?: unknown } }).plugin;
		plugin.historyManager = undefined;
		await closeAfter(b, (c) => inc(c[0]!));
		expect(b.readingData.updateBook).toHaveBeenCalled();
		expect(b.onChanged).toHaveBeenCalledTimes(1);
	});
});

describe('ReadingDetailModal.saveStatus', () => {
	const pick = async (b: Built, status: 'Completed' | 'Dropped' | 'Reading' | 'Plan to Read') => {
		const wrap = document.createElement('div');
		b.modal.contentEl.appendChild(wrap);
		b.modal.renderStatusBadge(wrap);
		(wrap.querySelector('.hoard-reading-detail__status') as HTMLElement).click();
		const label = readingStatusLabel(status);
		const opt = Array.from(b.modal.contentEl.querySelectorAll<HTMLElement>('.hoard-status-dropdown__option'))
			.find((o) => o.textContent === label);
		expect(opt).toBeDefined();
		opt!.click();
		await flush();
		return wrap;
	};

	it('saves a book status, repaints the badge and signals the change', async () => {
		const b = build({ item: baseBook({ status: 'Plan to Read' }) });
		const wrap = await pick(b, 'Dropped');
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', status: 'Dropped' }));
		expect((b.store.item as Book).dateFinished).toBeUndefined();
		expect(b.onChanged).toHaveBeenCalledTimes(1);
		expect(wrap.querySelector('.hoard-reading-detail__status')!.textContent).toBe(readingStatusLabel('Dropped'));
	});

	it('stamps the finish date when completing without one', async () => {
		const b = build();
		await pick(b, 'Completed');
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Completed', dateFinished: todayIso() }));
	});

	it('keeps an existing finish date', async () => {
		const b = build({ item: baseBook({ dateFinished: '2020-02-02' }) });
		await pick(b, 'Completed');
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Completed', dateFinished: '2020-02-02' }));
	});

	it('saves manga through updateManga', async () => {
		const b = build({ mode: 'manga' });
		await pick(b, 'Completed');
		expect(b.readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', status: 'Completed', dateFinished: todayIso() }));
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
	});

	it('does nothing when the item vanished before the pick', async () => {
		const b = build();
		const wrap = document.createElement('div');
		b.modal.contentEl.appendChild(wrap);
		b.modal.renderStatusBadge(wrap);
		(wrap.querySelector('.hoard-reading-detail__status') as HTMLElement).click();
		b.store.item = undefined;
		Array.from(b.modal.contentEl.querySelectorAll<HTMLElement>('.hoard-status-dropdown__option'))[0]!.click();
		await flush();
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
		expect(b.onChanged).not.toHaveBeenCalled();
	});
});

describe('ReadingDetailModal.resolveItemLink', () => {
	const anchor = (b: Built, item: Book | Manga) => {
		const grid = document.createElement('div');
		b.modal.renderIdCell(grid, item);
		return grid.querySelector<HTMLAnchorElement>('a.hoard-reading-detail__link');
	};

	it('prefers the explicit link over the derived one', () => {
		const item = baseBook({ externalLink: 'https://own.test/x', googleBooksId: 'g1' });
		const b = build({ item });
		expect(b.modal.resolveItemLink(item)).toBe('https://own.test/x');
		expect(anchor(b, item)!.getAttribute('href')).toBe('https://own.test/x');
	});

	it('derives a Google Books url for books and encodes the id', () => {
		const item = baseBook({ googleBooksId: 'a b/c' });
		const b = build({ item });
		expect(b.modal.resolveItemLink(item)).toBe('https://books.google.com/books?id=a%20b%2Fc');
		const a = anchor(b, item)!;
		expect(a.textContent).toBe('a b/c');
		expect(a.getAttribute('rel')).toBe('noopener noreferrer');
	});

	it('derives a MyAnimeList url for manga', () => {
		const item = baseManga({ malId: '2' });
		const b = build({ mode: 'manga', item });
		expect(b.modal.resolveItemLink(item)).toBe('https://myanimelist.net/manga/2');
		expect(anchor(b, item)!.getAttribute('href')).toBe('https://myanimelist.net/manga/2');
	});

	it('yields no link without an id, and the cell shows a dash', () => {
		const book = baseBook();
		const manga = baseManga();
		const bb = build({ item: book });
		const bm = build({ mode: 'manga', item: manga });
		expect(bb.modal.resolveItemLink(book)).toBe('');
		expect(bm.modal.resolveItemLink(manga)).toBe('');
		expect(anchor(bb, book)).toBeNull();
		const grid = document.createElement('div');
		bb.modal.renderIdCell(grid, book);
		expect(grid.textContent).toContain('—');
	});
});

describe('ReadingDetailModal id editor commit', () => {
	const openEditor = (b: Built, item: Book | Manga) => {
		const grid = document.createElement('div');
		b.modal.renderIdCell(grid, item);
		(grid.querySelector('.hoard-reading-detail__id-edit') as HTMLElement).click();
		const input = grid.querySelector<HTMLInputElement>('input')!;
		const save = grid.querySelector<HTMLElement>('.hoard-btn--success')!;
		return { grid, input, save };
	};

	it('saves a changed book id, refetches the cover and shows the new id', async () => {
		const item = baseBook({ googleBooksId: 'old' });
		const b = build({ item });
		const { grid, input, save } = openEditor(b, item);
		expect(input.value).toBe('old');
		input.value = '  new1 ';
		save.click();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ googleBooksId: 'new1' }));
		expect(b.apiService.getGoogleBookById).toHaveBeenCalledWith('new1');
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ coverUrl: 'http://c/n.jpg' }));
		expect(grid.querySelector('input')).toBeNull();
		expect(grid.querySelector('a.hoard-reading-detail__link')!.textContent).toBe('new1');
		expect(b.onChanged).toHaveBeenCalledTimes(2);
	});

	it('saves a changed manga id on Enter and looks up the numeric id', async () => {
		const item = baseManga({ malId: '1' });
		const b = build({ mode: 'manga', item });
		const { input } = openEditor(b, item);
		input.value = '42';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect(b.readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ malId: '42' }));
		expect(b.apiService.getMangaByMalId).toHaveBeenCalledWith(42);
	});

	it('only restores the display when the id is unchanged', async () => {
		const item = baseBook({ googleBooksId: 'same' });
		const b = build({ item });
		const { grid, input, save } = openEditor(b, item);
		input.value = ' same ';
		save.click();
		await flush();
		expect(b.readingData.updateBook).not.toHaveBeenCalled();
		expect(b.apiService.getGoogleBookById).not.toHaveBeenCalled();
		expect(grid.querySelector('a.hoard-reading-detail__link')!.textContent).toBe('same');
	});

	it('clears the id without refetching a cover', async () => {
		const item = baseBook({ googleBooksId: 'old' });
		const b = build({ item });
		const { input, save } = openEditor(b, item);
		input.value = '';
		save.click();
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ googleBooksId: '' }));
		expect(b.apiService.getGoogleBookById).not.toHaveBeenCalled();
	});

	it('does nothing when the item vanished, and cancel or Escape restore the display', async () => {
		const item = baseBook({ googleBooksId: 'old' });
		const gone = build({ item });
		const g = openEditor(gone, item);
		gone.store.item = undefined;
		g.input.value = 'x';
		g.save.click();
		await flush();
		expect(gone.readingData.updateBook).not.toHaveBeenCalled();

		const b = build({ item });
		const e = openEditor(b, item);
		e.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(e.grid.querySelector('input')).toBeNull();
		expect(e.grid.querySelector('a.hoard-reading-detail__link')!.textContent).toBe('old');
		const e2 = openEditor(b, item);
		(e2.grid.querySelectorAll('button')[1] as HTMLElement).click();
		expect(e2.grid.querySelector('input')).toBeNull();
	});
});

describe('ReadingDetailModal.renderCustomFieldRow', () => {
	const col = { id: 'c1', name: 'Series', type: 'text' } as ReadingCustomColumn;

	const row = (b: Built, item: Book | Manga, c: ReadingCustomColumn = col) => {
		const parent = document.createElement('div');
		b.modal.renderCustomFieldRow(parent, item, c);
		return parent.querySelector<HTMLElement>('.hoard-reading-custom-fields__row')!;
	};

	it('shows the column name and a placeholder dash for a missing value', () => {
		const item = baseBook();
		const r = row(build({ item }), item);
		expect(r.querySelector('.hoard-reading-custom-fields__label')!.textContent).toBe('Series');
		const display = r.querySelector('.hoard-reading-custom-fields__display')!;
		expect(display.textContent).toBe('—');
		expect(display.classList.contains('is-placeholder')).toBe(true);
	});

	it('shows the stored value, including zero', () => {
		const item = baseBook({ customFields: { c1: 'Dune Saga', c2: 0 } });
		const b = build({ item });
		expect(row(b, item).querySelector('.hoard-reading-custom-fields__display')!.textContent).toBe('Dune Saga');
		const zero = row(b, item, { id: 'c2', name: 'Count', type: 'number' } as ReadingCustomColumn);
		const display = zero.querySelector('.hoard-reading-custom-fields__display')!;
		expect(display.textContent).toBe('0');
		expect(display.classList.contains('is-placeholder')).toBe(false);
	});

	it('tints the label with a derived fill in the default fill style', () => {
		const item = baseBook();
		const r = row(build({ item }), item, { ...col, color: '#336699' });
		const label = r.querySelector<HTMLElement>('.hoard-reading-custom-fields__label')!;
		expect(label.style.getPropertyValue('--hoard-reading-custom-fields-background')).toBe(deriveFillColor('#336699'));
		expect(label.style.getPropertyValue('--hoard-reading-custom-fields-border')).toBe('');
	});

	it('uses the default colour and a border in border style, per mode', () => {
		const book = baseBook();
		const rb = row(build({ item: book, settings: { bookCustomFieldStyle: 'border' } }), book);
		const bl = rb.querySelector<HTMLElement>('.hoard-reading-custom-fields__label')!;
		expect(bl.style.getPropertyValue('--hoard-reading-custom-fields-border')).toBe(deriveBorderColor(DEFAULT_FIELD_COLOR));
		expect(bl.style.getPropertyValue('--hoard-reading-custom-fields-background')).toBe('');

		const manga = baseManga();
		const settings = { bookCustomFieldStyle: 'border', mangaCustomFieldStyle: 'fill' };
		const rm = row(build({ mode: 'manga', item: manga, settings }), manga);
		const ml = rm.querySelector<HTMLElement>('.hoard-reading-custom-fields__label')!;
		expect(ml.style.getPropertyValue('--hoard-reading-custom-fields-background')).toBe(deriveFillColor(DEFAULT_FIELD_COLOR));

		const mangaBorder = row(build({ mode: 'manga', item: manga, settings: { mangaCustomFieldStyle: 'border' } }), manga);
		expect(mangaBorder.querySelector<HTMLElement>('.hoard-reading-custom-fields__label')!
			.style.getPropertyValue('--hoard-reading-custom-fields-border')).not.toBe('');
	});

	it('opens the editor prefilled when the value is clicked', () => {
		const item = baseBook({ customFields: { c1: 'abc' } });
		const r = row(build({ item }), item);
		(r.querySelector('.hoard-reading-custom-fields__display') as HTMLElement).click();
		expect(r.querySelector<HTMLInputElement>('input')!.value).toBe('abc');
	});

	it('tolerates an item without custom fields', () => {
		const item = baseBook();
		(item as unknown as { customFields?: unknown }).customFields = undefined;
		const r = row(build({ item }), item);
		expect(r.querySelector('.hoard-reading-custom-fields__display')!.textContent).toBe('—');
	});
});

describe('ReadingDetailModal.applyAutoComplete / isBookComplete', () => {
	it('does not complete a pages book below its total or with unknown totals', async () => {
		const below = build({ item: baseBook({ totalPages: 10, pagesRead: 2 }) });
		inc(renderGauges(below)[0]!);
		below.modal.close();
		await flush();
		expect(below.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Reading', pagesRead: 3 }));

		const unknown = build();
		inc(renderGauges(unknown)[0]!, 5);
		unknown.modal.close();
		await flush();
		expect(unknown.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Reading' }));
	});

	it('completes through the explicit commit as well and closes the modal', async () => {
		const b = build({ item: baseBook({ totalPages: 2 }) });
		inc(renderGauges(b)[0]!, 2);
		await b.modal.commitDraft();
		expect(b.readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ status: 'Completed' }));
		// close() inside commitDraft sees an unchanged snapshot and saves only once
		await flush();
		expect(b.readingData.updateBook).toHaveBeenCalledTimes(1);
	});
});
