// Counts and edit targets of the fixtures in hoard-test-vault/ (catalogue: hoard-test-vault/Welcome.md).
// `test/fixtures.test.ts` proves they equal what the real codecs decode, so a smoke test can compare
// them with the live plugin's getters. A note with unreadable properties is skipped by the index and
// counted nowhere.
export const EXPECTED = {
	// dataManager.getTitles().length: library titles; `Maybe: true` notes are NOT included.
	watch: 8,
	// readingDataManager.getBooks().length
	books: 1,
	// readingDataManager.getMangaList().length
	manga: 1,
	// gameDataManager.getGames().length
	games: 2,
	// dataManager.getMaybeTitles().length
	maybe: 1,
	// dataManager.getAirtimeEntries().length across watch, books, manga and games: manual schedules
	// plus derived "To be released" cards. Here only the manual `once` schedule of Frieren Season 3.
	airtime: 1,
	// historyManager.getEntries().length: parseable lines of <root>/History.md; foreign lines are ignored.
	history: 7,
	// number of notes directly in <root>/CustomLists/
	customLists: 2,
};
// Vault-relative note paths the click flows edit.
// A TV Show with two seasons and watched episodes (episode +1, status change).
export const FIXTURE_EDIT_TITLE = "Hoard/TV Show/Severance.md";
// A watch note with `## Notes` and a foreign `## Mine` section that must survive edits.
export const FIXTURE_DETAIL_TITLE = "Hoard/Animation/Spider-Verse.md";
