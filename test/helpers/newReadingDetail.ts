import { vi } from 'vitest';
import {
	ReadingDetailModal,
	type ReadingDetailModals,
	type ReadingDetailOptions,
} from '../../src/modules/reading/ui/ReadingDetailModal';

/** Spy dialogs for a detail modal; replace single entries to assert on them. */
export const spyReadingDetailModals = (): { [K in keyof ReadingDetailModals]: ReturnType<typeof vi.fn> } => ({
	openManageColumns: vi.fn(),
	pickVaultFile: vi.fn(),
	confirm: vi.fn(),
});

/** The collaborators a test hands to the modal; anything unused stays an empty fake. */
interface DetailParts {
	settings: unknown;
	reading: unknown;
	api?: unknown;
	history?: unknown;
	files?: unknown;
	modals?: Partial<ReadingDetailModals>;
}

export function newReadingDetail(parts: DetailParts, opts: ReadingDetailOptions): ReadingDetailModal {
	return new ReadingDetailModal(
		{} as never,
		parts.settings as never,
		parts.reading as never,
		(parts.api ?? {}) as never,
		(parts.history ?? { log: () => {} }) as never,
		(parts.files ?? {}) as never,
		{ ...spyReadingDetailModals(), ...parts.modals } as ReadingDetailModals,
		opts,
	);
}
