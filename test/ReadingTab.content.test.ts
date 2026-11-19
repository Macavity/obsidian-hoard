import { newReadingTab } from './helpers/newReadingTab';
import { describe, expect, it, vi } from 'vitest';
import type { Book } from '../src/modules/reading/exports';
import { t } from '../src/shared/i18n';
import { fakeSettings } from './helpers/fakeSettings';

const book = (id: string, over: Partial<Book> = {}): Book => ({
	id, title: id, author: '', status: 'Reading', rating: 0, progressUnit: 'pages', pagesRead: 0, totalPages: 0,
	wordsRead: 0, totalWords: 0, chaptersRead: 0, totalChapters: 0, coverUrl: '', vaultPage: '', dateStarted: null,
	dateFinished: null, releaseDate: null, dateAdded: '2024-01-01T00:00:00.000Z', dateModified: '', customFields: {}, ...over,
} as unknown as Book);

interface Internals { contentEl: HTMLElement; searchQuery: string; renderContent: () => void }

function build(books: Book[], query = '') {
	const reading = {
		onChange: () => {}, offChange: () => {},
		getSettings: () => ({ defaultSubTab: 'books', statusColors: {}, rowsLayout: undefined }),
		getBooks: () => books,
		getMangaList: () => [],
		getBookColumns: () => [],
		getMangaColumns: () => [],
		persistQuiet: vi.fn(),
	};
	const container = document.createElement('div');
	const content = document.createElement('div');
	container.appendChild(content);
	const tab = newReadingTab(container, { reading, settings: fakeSettings({}), isCardTextUnder: () => false, getCardMinWidth: () => 150 }) as unknown as Internals;
	tab.contentEl = content;
	tab.searchQuery = query;
	tab.renderContent();
	return { content };
}

describe('ReadingTab.renderContent', () => {
	it('shows the empty state without items', () => {
		const { content } = build([]);
		expect(content.querySelector('.hoard-reading__scroll-container')).toBeNull();
		expect(content.textContent).not.toBe('');
	});

	it('renders the shelves in a scroll container with the results count', () => {
		const { content } = build([book('a'), book('b', { favorite: true })]);
		expect(content.querySelector('.hoard-reading__scroll-container')).not.toBeNull();
		expect(content.querySelector('.hoard-toolbar__results-count')).not.toBeNull();
		expect(content.querySelectorAll('.hoard-rows-view__shelf-title').length).toBeGreaterThan(0);
	});

	it('says so when a search matches nothing', () => {
		const { content } = build([book('a')], 'zzz');
		expect(content.textContent).toContain(t('reading.noMatchesQuery', { query: 'zzz' }));
		expect(content.querySelector('.hoard-reading__scroll-container')).toBeNull();
	});
});
