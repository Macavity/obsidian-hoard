import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findReportNote, reportNotePath } from "../scripts/e2e/scenarios/common.mjs";

function vaultWith(date: Date) {
	const vault = mkdtempSync(join(tmpdir(), "rn-"));
	mkdirSync(join(vault, "Hoard"));
	writeFileSync(join(vault, reportNotePath(date)), "x");
	return vault;
}

describe("findReportNote", () => {
	const justAfterMidnight = new Date(2026, 10, 10, 0, 0, 30);
	it("accepts the note written before midnight", () => {
		const vault = vaultWith(new Date(2026, 10, 9, 23, 59));
		expect(findReportNote(vault, justAfterMidnight)).toBe(reportNotePath(new Date(2026, 10, 9)));
	});
	it("ignores an older note", () => {
		expect(findReportNote(vaultWith(new Date(2026, 10, 8)), justAfterMidnight)).toBeNull();
	});
});
