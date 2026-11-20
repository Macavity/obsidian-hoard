import { vi } from 'vitest';
import type { OpenAddWizard } from '../../src/modules/add/exports';
import { DraftsTab } from '../../src/modules/drafts/ui/DraftsTab';

/** The collaborators a test hands to the tab; anything unused stays an empty fake. */
export interface DraftsParts {
	settings: unknown;
	titles: unknown;
	reading: unknown;
	games: unknown;
	notes?: unknown;
	openAddWizard?: OpenAddWizard;
}

export function newDraftsTab(container: unknown, parts: DraftsParts, onCountChange: (count: number) => void = () => {}): DraftsTab {
	return new DraftsTab(
		container as HTMLElement,
		parts.settings as never,
		parts.titles as never,
		parts.reading as never,
		parts.games as never,
		(parts.notes ?? {}) as never,
		parts.openAddWizard ?? vi.fn(),
		onCountChange,
	);
}
