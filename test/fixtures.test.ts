import { describe, it, expect } from "vitest";
import { EXPECTED, FIXTURE_EDIT_TITLE, FIXTURE_DETAIL_TITLE } from "./e2e/expected.mjs";
import { decodeVaultFixtures } from "./helpers/vaultFixtures";

describe("hoard-test-vault fixtures", () => {
	const r = decodeVaultFixtures();
	it("decode to the expected counts", () => {
		expect({
			watch: r.titles.filter((t) => !t.maybe).length,
			books: r.books.length,
			manga: r.manga.length,
			games: r.games.length,
			maybe: r.titles.filter((t) => t.maybe).length,
			airtime: r.airtimeEntries.length,
			history: r.historyEntries.length,
			customLists: r.customLists.length,
		}).toEqual(EXPECTED);
	});
	it("skip the broken note without throwing", () => expect(r.skipped).toHaveLength(1));
	it("carry no externalId", () => expect(r.withExternalId).toEqual([]));
	it("contain the notes the click flows edit", () => {
		expect(r.paths).toContain(FIXTURE_EDIT_TITLE);
		expect(r.paths).toContain(FIXTURE_DETAIL_TITLE);
	});
});
