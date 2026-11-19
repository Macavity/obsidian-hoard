import type { DraftPersistState } from '../domain/model';

/** The drafts tab's persisted state. */
export interface DraftStore {
	getDrafts(): Partial<DraftPersistState> | undefined;
	setDrafts(state: DraftPersistState): void;
}
