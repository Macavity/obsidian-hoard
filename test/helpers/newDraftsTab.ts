import { vi } from 'vitest';
import { DraftsTab } from '../../src/modules/drafts/ui/DraftsTab';

/** The collaborators a test hands to the tab; anything unused stays an empty fake. */
export interface DraftsParts {
	settings: unknown;
	titles: unknown;
	reading: unknown;
	games: unknown;
	notes?: unknown;
	openAdd?: (opts: { title: string; onAdded?: () => void }) => void;
}

export function newDraftsTab(container: unknown, parts: DraftsParts, onCountChange: (count: number) => void = () => {}): DraftsTab {
	return new DraftsTab(
		container as HTMLElement,
		parts.settings as never,
		parts.titles as never,
		parts.reading as never,
		parts.games as never,
		(parts.notes ?? {}) as never,
		parts.openAdd ?? vi.fn(),
		onCountChange,
	);
}
