import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadingDetailModal } from '../src/ReadingDetailModal';
import { t } from '../src/i18n';
import type { Book } from '../src/types';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const book = { id: 'b1', title: 'Dune', customFields: {} } as unknown as Book;

function build(read: () => Promise<string | null>) {
	const readingData = {
		getBook: vi.fn(() => book),
		readReadingNote: vi.fn(read),
		appendQuote: vi.fn(() => Promise.resolve()),
	};
	const modal = new ReadingDetailModal({} as never, { settings: {}, apiService: {}, app: {} } as never, readingData as never, 'book', 'b1', vi.fn());
	const m = modal as unknown as { renderQuotesSection: (i: Book) => void; contentEl: HTMLElement };
	m.renderQuotesSection(book);
	const list = () => m.contentEl.querySelector<HTMLElement>('.hoard-reading-quote-list')!;
	return { m, readingData, list };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('ReadingDetailModal quotes refresh', () => {
	it('shows the empty message without a note', async () => {
		const { list } = build(() => Promise.resolve(null));
		await flush();
		expect(list().textContent).toBe(t('detail.reading.noQuotes'));
	});

	it('shows the empty message when the note has no quotes', async () => {
		const { list } = build(() => Promise.resolve('# Dune\n'));
		await flush();
		expect(list().querySelector('.hoard-reading-quote-empty')).not.toBeNull();
	});

	it('renders parsed quotes with references', async () => {
		const note = '## Quotes\n> [!quote] p. 12\n> Fear is the mind-killer.\n\n> [!quote]\n> Second.\n';
		const { list } = build(() => Promise.resolve(note));
		await flush();
		const cards = list().querySelectorAll('.hoard-reading-quote-card');
		expect(cards).toHaveLength(2);
		expect(cards[0]!.querySelector('.hoard-reading-quote-ref')!.textContent).toBe('p. 12');
		expect(cards[1]!.querySelector('.hoard-reading-quote-ref')).toBeNull();
	});

	it('logs and keeps the list empty when reading fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { list } = build(() => Promise.reject(new Error('io')));
		await flush();
		expect(warn).toHaveBeenCalled();
		expect(list().children).toHaveLength(0);
	});

	it('refreshes the list after saving a new quote', async () => {
		let note: string | null = null;
		const { m, readingData, list } = build(() => Promise.resolve(note));
		await flush();
		m.contentEl.querySelector<HTMLElement>('.hoard-reading-detail-quotes-add')!.click();
		const ta = m.contentEl.querySelector<HTMLTextAreaElement>('.hoard-reading-quote-textarea')!;
		ta.value = 'New quote';
		note = '## Quotes\n> [!quote]\n> New quote\n';
		m.contentEl.querySelector<HTMLElement>('.hoard-reading-quote-save')!.click();
		await flush();
		expect(readingData.appendQuote).toHaveBeenCalled();
		expect(list().querySelector('.hoard-reading-quote-text')!.textContent).toBe('New quote');
	});
});
