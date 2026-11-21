import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import { findNewerObsidianApis } from "./helpers/obsidianSince";

// Every Obsidian API src/ uses must exist in the oldest app the manifest admits (docs: @since in obsidian.d.ts).
const { minAppVersion } = JSON.parse(readFileSync("manifest.json", "utf8")) as { minAppVersion: string };
const TIMEOUT = 120_000;

describe("Obsidian APIs vs minAppVersion", () => {
	it("src uses no API newer than minAppVersion", () => {
		const rootNames = ts.sys.readDirectory("src", [".ts"]).filter((f) => !f.endsWith(".test.ts"));
		expect(rootNames.length).toBeGreaterThan(50);
		expect(findNewerObsidianApis({ minAppVersion, rootNames })).toEqual([]);
	}, TIMEOUT);

	it("reports a method newer than minAppVersion", () => {
		const found = findNewerObsidianApis({
			minAppVersion: "1.11.5",
			rootNames: ["virtual/a.ts"],
			virtualFiles: {
				"virtual/a.ts": `import type { ButtonComponent } from "obsidian";\nexport const f = (b: ButtonComponent) => b.setDestructive();`,
			},
		});
		expect(found).toContainEqual({ file: "virtual/a.ts", line: 2, symbol: "ButtonComponent.setDestructive", since: "1.13.0" });
	}, TIMEOUT);

	it("reports constructing a newer class", () => {
		const found = findNewerObsidianApis({
			minAppVersion: "1.11.5",
			rootNames: ["virtual/b.ts"],
			virtualFiles: {
				"virtual/b.ts": `import { ConfirmationModal, type App } from "obsidian";\nexport const m = (app: App) => new ConfirmationModal(app);`,
			},
		});
		expect(found).toContainEqual(expect.objectContaining({ line: 2, since: "1.13.0" }));
	}, TIMEOUT);

	it("accepts an API at or below minAppVersion", () => {
		const found = findNewerObsidianApis({
			minAppVersion: "1.11.5",
			rootNames: ["virtual/c.ts"],
			virtualFiles: {
				"virtual/c.ts": `import type { App } from "obsidian";\nexport const s = (a: App) => a.secretStorage;`,
			},
		});
		expect(found).toEqual([]);
	}, TIMEOUT);
});
