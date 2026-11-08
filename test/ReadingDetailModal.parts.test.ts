import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FuzzySuggestModal, Notice } from 'obsidian';
import { ReadingDetailModal } from '../src/ReadingDetailModal';
import { t } from '../src/i18n';
import type { Book, Manga, ReadingCustomColumn } from '../src/types';

const shown = (Notice as unknown as { shown: string[] }).shown;

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

const baseBook = (over: Partial<Book> = {}): Book => ({
	id: 'b1', title: 'Dune', author: 'Herbert', status: 'Reading', rating: 0, progressUnit: 'pages',
	pagesRead: 0, totalPages: 0, coverUrl: '', googleBooksId: '', vaultPage: '', externalLink: '',
	dateAdded: '', customFields: {}, ...over,
} as unknown as Book);
const baseManga = (over: Partial<Manga> = {}): Manga => ({
	id: 'm1', title: 'Berserk', author: 'Miura', status: 'Reading', rating: 0, chaptersRead: 0, volumesRead: 0,
	coverUrl: '', malId: '', vaultPage: '', externalLink: '', dateAdded: '', customFields: {}, ...over,
} as unknown as Manga);

interface Opts {
	mode?: 'book' | 'manga';
	item?: Book | Manga | undefined;
	hasKey?: boolean;
	result?: { coverUrl: string } | null;
	fail?: boolean;
	onFile?: unknown;
	files?: unknown[];
}

function build(o: Opts = {}) {
	const mode = o.mode ?? 'book';
	const item = 'item' in o ? o.item : (mode === 'book' ? baseBook() : baseManga());
	const readingData = {
		getBook: vi.fn(() => item as Book | undefined),
		getManga: vi.fn(() => item as Manga | undefined),
		updateBook: vi.fn(() => Promise.resolve()),
		updateManga: vi.fn(() => Promise.resolve()),
		setCustomField: vi.fn(() => Promise.resolve()),
	};
	const fail = () => Promise.reject(new Error('x'));
	const apiService = {
		hasGoogleBooksKey: () => o.hasKey ?? true,
		getGoogleBookById: vi.fn(() => (o.fail ? fail() : Promise.resolve(o.result ?? null))),
		getMangaByMalId: vi.fn(() => (o.fail ? fail() : Promise.resolve(o.result ?? null))),
	};
	const getAbstractFileByPath = vi.fn(() => o.onFile ?? null);
	const openFile = vi.fn();
	const plugin = {
		settings: {},
		apiService,
		app: {
			vault: { getAbstractFileByPath, getMarkdownFiles: () => o.files ?? [] },
			workspace: { getLeaf: () => ({ openFile }) },
		},
	};
	const onChanged = vi.fn();
	const modal = new ReadingDetailModal({} as never, plugin as never, readingData as never, mode, 'x', onChanged);
	const x = modal as unknown as {
		refetchCoverFromId: (id: string) => Promise<void>;
		renderCustomValueEditor: (cell: HTMLElement, item: Book | Manga, col: ReadingCustomColumn, cur: string | number | undefined) => void;
		renderVaultRow: (row: HTMLElement) => void;
		renderExternalLinkActions: (c: HTMLElement) => void;
		close: () => void;
	};
	return { modal: x, readingData, apiService, onChanged, openFile, getAbstractFileByPath };
}

beforeEach(() => { shown.length = 0; });

describe('ReadingDetailModal.refetchCoverFromId', () => {
	it('warns without a Google Books key', async () => {
		const { modal, apiService } = build({ hasKey: false });
		await modal.refetchCoverFromId('g1');
		expect(shown).toEqual([t('reading.notices.googleBooksKeyRequired')]);
		expect(apiService.getGoogleBookById).not.toHaveBeenCalled();
	});

	it('warns when the volume has no cover', async () => {
		const missing = build({ result: null });
		await missing.modal.refetchCoverFromId('g1');
		const empty = build({ result: { coverUrl: '' } });
		await empty.modal.refetchCoverFromId('g1');
		expect(shown).toEqual([t('detail.reading.noBookCover'), t('detail.reading.noBookCover')]);
		expect(empty.readingData.updateBook).not.toHaveBeenCalled();
	});

	it('stores only the new book cover and signals the change', async () => {
		const { modal, readingData, onChanged } = build({ result: { coverUrl: 'http://c/n.jpg' } });
		await modal.refetchCoverFromId('g1');
		expect(readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', coverUrl: 'http://c/n.jpg' }));
		expect(onChanged).toHaveBeenCalledTimes(1);
	});

	it('does nothing when the book vanished meanwhile', async () => {
		const { modal, readingData, onChanged } = build({ result: { coverUrl: 'http://c/n.jpg' }, item: undefined });
		await modal.refetchCoverFromId('g1');
		expect(readingData.updateBook).not.toHaveBeenCalled();
		expect(onChanged).not.toHaveBeenCalled();
	});

	it('looks manga up by numeric MAL id', async () => {
		const { modal, apiService, readingData, onChanged } = build({ mode: 'manga', result: { coverUrl: 'http://c/m.jpg' } });
		await modal.refetchCoverFromId('42');
		expect(apiService.getMangaByMalId).toHaveBeenCalledWith(42);
		expect(readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', coverUrl: 'http://c/m.jpg' }));
		expect(onChanged).toHaveBeenCalledTimes(1);
	});

	it('warns when the manga has no cover and skips vanished manga', async () => {
		const none = build({ mode: 'manga', result: null });
		await none.modal.refetchCoverFromId('42');
		expect(shown).toEqual([t('detail.reading.noMangaCover')]);
		const gone = build({ mode: 'manga', result: { coverUrl: 'http://c/m.jpg' }, item: undefined });
		await gone.modal.refetchCoverFromId('42');
		expect(gone.readingData.updateManga).not.toHaveBeenCalled();
	});

	it('reports lookup failures for books and manga', async () => {
		await build({ fail: true }).modal.refetchCoverFromId('g1');
		await build({ mode: 'manga', fail: true }).modal.refetchCoverFromId('1');
		expect(shown).toEqual([t('notices.api.requestFailed'), t('notices.api.requestFailed')]);
	});
});

describe('ReadingDetailModal.renderCustomValueEditor', () => {
	const select = { id: 'c1', name: 'Series', type: 'select', options: ['A', 'B'] } as ReadingCustomColumn;
	const text = { id: 'c2', name: 'Note', type: 'text' } as ReadingCustomColumn;
	const num = { id: 'c3', name: 'Year', type: 'number' } as ReadingCustomColumn;

	it('offers a select with a blank option and the current value preselected', () => {
		const { modal } = build();
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), select, 'B');
		const sel = cell.querySelector('select')!;
		expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(['—', 'A', 'B']);
		expect(sel.options[2]!.selected).toBe(true);
	});

	it('preselects the blank option for an empty select value', () => {
		const { modal } = build();
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), select, undefined);
		expect(cell.querySelector('select')!.options[0]!.selected).toBe(true);
	});

	it('saves a chosen select value and shows it again', async () => {
		const { modal, readingData } = build({ item: baseBook({ customFields: { c1: 'A' } }) });
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), select, undefined);
		const sel = cell.querySelector('select')!;
		sel.value = 'A';
		sel.dispatchEvent(new Event('change'));
		await flush();
		expect(readingData.setCustomField).toHaveBeenCalledWith('book', 'b1', 'c1', 'A');
		expect(cell.querySelector('.hoard-reading-custom-display')!.textContent).toBe('A');
	});

	it('clears a select value with the blank option', async () => {
		const { modal, readingData } = build();
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), select, 'A');
		const sel = cell.querySelector('select')!;
		sel.value = '';
		sel.dispatchEvent(new Event('change'));
		await flush();
		expect(readingData.setCustomField).toHaveBeenCalledWith('book', 'b1', 'c1', null);
	});

	it('prefills a text input and commits the trimmed value on blur', async () => {
		const { modal, readingData } = build({ item: baseBook({ customFields: { c2: 'hi' } }) });
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), text, 'old');
		const input = cell.querySelector('input')!;
		expect(input.value).toBe('old');
		input.value = '  hi  ';
		input.dispatchEvent(new Event('blur'));
		await flush();
		expect(readingData.setCustomField).toHaveBeenCalledWith('book', 'b1', 'c2', 'hi');
		expect(cell.querySelector('.hoard-reading-custom-display')!.textContent).toBe('hi');
	});

	it('saves null for an empty value and parses numbers, dropping invalid ones', async () => {
		const { modal, readingData } = build();
		const run = async (col: ReadingCustomColumn, value: string) => {
			const cell = document.createElement('div');
			modal.renderCustomValueEditor(cell, baseBook(), col, undefined);
			const input = cell.querySelector('input')!;
			expect(input.getAttribute('type')).toBe(col.type === 'number' ? 'number' : 'text');
			input.value = value;
			input.dispatchEvent(new Event('blur'));
			await flush();
		};
		await run(text, '   ');
		await run(num, '1999');
		await run(num, 'abc');
		expect((readingData.setCustomField.mock.calls as unknown[][]).map((c) => c[3])).toEqual([null, 1999, null]);
	});

	it('commits on Enter via blur and aborts on Escape without saving', () => {
		const { modal, readingData } = build();
		const cell = document.createElement('div');
		modal.renderCustomValueEditor(cell, baseBook(), text, 'x');
		const input = cell.querySelector('input')!;
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(cell.querySelector('input')).toBeNull();
		expect(cell.querySelector('.hoard-reading-custom-display')).not.toBeNull();
		expect(readingData.setCustomField).not.toHaveBeenCalled();
		const cell2 = document.createElement('div');
		document.body.appendChild(cell2);
		modal.renderCustomValueEditor(cell2, baseBook(), text, 'x');
		const input2 = cell2.querySelector('input')!;
		input2.focus();
		const blur = vi.spyOn(input2, 'blur');
		input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(blur).toHaveBeenCalled();
		cell2.remove();
	});
});

describe('ReadingDetailModal.renderVaultRow', () => {
	it('shows the not-linked state without a vault page', () => {
		const { modal } = build();
		const row = document.createElement('div');
		modal.renderVaultRow(row);
		expect(row.querySelector('.hoard-reading-detail-vault-empty')!.textContent).toBe(t('detail.reading.notLinked'));
		expect(row.querySelectorAll('button')).toHaveLength(1);
		expect(row.querySelector('button')!.title).toBe(t('detail.reading.linkVaultNote'));
	});

	it('shows file name, open button and path tooltip for a linked page', () => {
		const { modal } = build({ item: baseBook({ vaultPage: 'Notes/Dune.md' }) });
		const row = document.createElement('div');
		modal.renderVaultRow(row);
		expect(row.querySelector('.hoard-reading-detail-vault-path')!.textContent).toBe('Dune.md');
		expect((row.querySelector('.hoard-reading-detail-vault-path') as HTMLElement).title).toBe('Notes/Dune.md');
		expect(row.querySelectorAll('button')).toHaveLength(2);
		expect(row.querySelector('button')!.title).toBe(t('detail.reading.linked', { path: 'Notes/Dune.md' }));
	});

	it('warns when the linked page is missing from the vault', () => {
		const { modal } = build({ item: baseBook({ vaultPage: 'Notes/Dune.md' }) });
		const row = document.createElement('div');
		modal.renderVaultRow(row);
		(row.querySelectorAll('button')[1] as HTMLElement).click();
		expect(shown).toEqual([t('detail.reading.vaultMissing')]);
	});

	it('renders nothing when the item is gone', () => {
		const { modal } = build({ item: undefined });
		const row = document.createElement('div');
		modal.renderVaultRow(row);
		expect(row.children).toHaveLength(0);
	});

	it('opens the vault file picker from the link button', () => {
		const { modal } = build({ files: [] });
		const row = document.createElement('div');
		modal.renderVaultRow(row);
		const opened = vi.spyOn(FuzzySuggestModal.prototype, 'open');
		(row.querySelector('button') as HTMLElement).click();
		expect(opened).toHaveBeenCalledTimes(1);
		opened.mockRestore();
	});
});

describe('ReadingDetailModal.renderExternalLinkActions', () => {
	it('offers the add-link button only without a link', () => {
		const { modal } = build();
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		const buttons = c.querySelectorAll('button');
		expect(buttons).toHaveLength(1);
		expect(buttons[0]!.textContent).toBe(t('detail.reading.externalLink'));
	});

	it('offers change and open buttons with a link', () => {
		const { modal } = build({ item: baseBook({ externalLink: 'https://x.test' }) });
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		const buttons = Array.from(c.querySelectorAll('button'));
		expect(buttons.map((b) => b.textContent)).toEqual([t('detail.reading.changeLink'), t('detail.reading.open')]);
		expect(buttons[1]!.title).toBe('https://x.test');
	});

	it('edits and saves the link for a book, then returns to the buttons', async () => {
		const { modal, readingData, onChanged } = build();
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		(c.querySelector('button') as HTMLElement).click();
		const input = c.querySelector('input')!;
		input.value = ' https://new.test ';
		(c.querySelectorAll('button')[0] as HTMLElement).click();
		await flush();
		expect(readingData.updateBook).toHaveBeenCalledWith(expect.objectContaining({ externalLink: 'https://new.test' }));
		expect(onChanged).toHaveBeenCalled();
		expect(c.querySelector('input')).toBeNull();
	});

	it('saves the link for manga on Enter and cancels on Escape', async () => {
		const { modal, readingData } = build({ mode: 'manga' });
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		(c.querySelector('button') as HTMLElement).click();
		const input = c.querySelector('input')!;
		input.value = 'https://m.test';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect(readingData.updateManga).toHaveBeenCalledWith(expect.objectContaining({ externalLink: 'https://m.test' }));
		(c.querySelector('button') as HTMLElement).click();
		c.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(c.querySelector('input')).toBeNull();
		(c.querySelector('button') as HTMLElement).click();
		(c.querySelectorAll('button')[1] as HTMLElement).click();
		expect(c.querySelector('input')).toBeNull();
	});

	it('renders nothing when the item is gone', () => {
		const { modal } = build({ item: undefined });
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		expect(c.children).toHaveLength(0);
	});

	it('opens the link in a new window', () => {
		const open = vi.fn();
		(globalThis as unknown as { activeWindow: unknown }).activeWindow = { open };
		const { modal } = build({ item: baseBook({ externalLink: 'https://x.test' }) });
		const c = document.createElement('div');
		modal.renderExternalLinkActions(c);
		(c.querySelectorAll('button')[1] as HTMLElement).click();
		expect(open).toHaveBeenCalledWith('https://x.test', '_blank', 'noopener,noreferrer');
	});
});
