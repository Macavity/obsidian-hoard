export interface DraftPersistState {
	dismissed: string[];                   // lowercased title keys
	added: string[];                       // lowercased title keys
	firstSeen: Record<string, string>;     // lowercase key → ISO timestamp
	titleDisplay: Record<string, string>;  // lowercase key → original-case display title
}

/** The drafts tab's persisted state. */
export interface DraftStore {
	getDrafts(): Partial<DraftPersistState> | undefined;
	setDrafts(state: DraftPersistState): void;
}
