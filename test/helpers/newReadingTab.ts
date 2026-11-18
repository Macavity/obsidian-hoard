import { vi } from 'vitest';
import { ReadingTab, type ReadingTabModals } from '../../src/modules/reading/ui/ReadingTab';

/** Spy dialogs; `confirm` accepts at once, like a user clicking through. */
export const spyReadingModals = (over: Partial<ReadingTabModals> = {}): ReadingTabModals => ({
	openAddReading: vi.fn(),
	openManageColumns: vi.fn(),
	openDetail: vi.fn(),
	openRowsCustomize: vi.fn(),
	searchHelp: vi.fn(),
	confirm: vi.fn((_message: string, onConfirm: () => void) => onConfirm()),
	...over,
});

/** The collaborators a test hands to the tab; anything unused stays an empty fake. */
interface TabParts {
	settings: unknown;
	reading: unknown;
	api?: unknown;
	searchBooks?: unknown;
	fetchReadingCoverById?: unknown;
	firstBookCover?: unknown;
	isCardTextUnder?: () => boolean;
	getCardMinWidth?: () => number;
	modals?: Partial<ReadingTabModals>;
}

export function newReadingTab(container: unknown, parts: TabParts): ReadingTab {
	return new ReadingTab(
		container as HTMLElement,
		parts.settings as never,
		parts.reading as never,
		(parts.api ?? {}) as never,
		{
			searchBooks: parts.searchBooks ?? vi.fn(),
			fetchReadingCoverById: parts.fetchReadingCoverById ?? vi.fn(),
			firstBookCover: parts.firstBookCover ?? vi.fn(),
		} as never,
		{ getCardMinWidth: parts.getCardMinWidth ?? (() => 150), isCardTextUnder: parts.isCardTextUnder ?? (() => true) },
		spyReadingModals(parts.modals),
	);
}
