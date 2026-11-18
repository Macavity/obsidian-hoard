import { vi } from 'vitest';
import {
	TitleDetailModal,
	type TitleDetailModals,
	type TitleDetailOptions,
} from '../../src/modules/watchlist/ui/TitleDetailModal';

/** Spy dialogs for a detail modal; replace single entries to assert on them. */
const spyModals = (): { [K in keyof TitleDetailModals]: ReturnType<typeof vi.fn> } => ({
	openAddCredit: vi.fn(),
	openEditTitle: vi.fn(),
	openCollection: vi.fn(),
	openTitleDetail: vi.fn(),
	confirm: vi.fn(),
});

/** The collaborators a test hands to the modal; anything unused stays an empty fake. */
export interface TitleDetailParts {
	settings: unknown;
	titles: unknown;
	api?: unknown;
	posters?: unknown;
	modals?: Partial<TitleDetailModals>;
}

export function newTitleDetail(parts: TitleDetailParts, opts: TitleDetailOptions): TitleDetailModal {
	return new TitleDetailModal(
		{} as never,
		parts.settings as never,
		parts.titles as never,
		(parts.api ?? {}) as never,
		(parts.posters ?? { enqueue: () => Promise.resolve(null) }) as never,
		{} as never,
		{ ...spyModals(), ...parts.modals } as TitleDetailModals,
		opts,
	);
}
