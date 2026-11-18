import { vi } from 'vitest';
import { GamesTab, type GamesTabModals } from '../../src/modules/games/ui/GamesTab';

/** Spy dialogs; `confirm` accepts at once, like a user clicking through. */
export const spyGamesModals = (over: Partial<GamesTabModals> = {}): GamesTabModals => ({
	openAddGame: vi.fn(),
	openGameDetail: vi.fn(),
	openGroupDetail: vi.fn(),
	openRowsCustomize: vi.fn(),
	renameGroup: vi.fn(),
	searchHelp: vi.fn(),
	confirm: vi.fn((_message: string, onConfirm: () => void) => onConfirm()),
	...over,
});

/** The collaborators a test hands to the tab; anything unused stays an empty fake. */
interface TabParts {
	settings: unknown;
	games: unknown;
	api?: unknown;
	resolveGameCover?: unknown;
	files?: unknown;
	isCardTextUnder?: () => boolean;
	getCardMinWidth?: () => number;
	modals?: Partial<GamesTabModals>;
}

export function newGamesTab(container: unknown, parts: TabParts): GamesTab {
	return new GamesTab(
		container as HTMLElement,
		parts.settings as never,
		parts.games as never,
		(parts.api ?? {}) as never,
		(parts.resolveGameCover ?? vi.fn()) as never,
		(parts.files ?? {}) as never,
		{ getCardMinWidth: parts.getCardMinWidth ?? (() => 150), isCardTextUnder: parts.isCardTextUnder ?? (() => true) },
		spyGamesModals(parts.modals),
	);
}
