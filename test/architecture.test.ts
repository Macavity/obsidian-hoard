import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

// Layer rules inside modules (docs/architecture/overview.md). Real file paths, so type-aware linting resolves them.
const eslint = new ESLint();
const UI_FILE = "src/modules/watchlist/ui/ListTab.ts";
const SERVICE_FILE = "src/modules/watchlist/services/DataManager.ts";

async function lint(code: string, filePath: string) {
	const [result] = await eslint.lintText(code, { filePath });
	return result?.messages ?? [];
}

const errorsOf = async (code: string, filePath: string, rulePart: string) =>
	(await lint(code, filePath)).filter((m) => m.ruleId?.includes(rulePart));

describe("architecture lint rules", () => {
	it("rejects a UI file importing shared/storage", async () => {
		const m = await errorsOf(`import { VaultStorage } from "../../../shared/storage/VaultStorage";\nexport const x = VaultStorage;`, UI_FILE, "no-restricted-imports");
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("docs/architecture/overview.md");
	});

	it("rejects a UI file importing a service as value", async () => {
		const m = await errorsOf(`import { DataManager } from "../services/DataManager";\nexport const x = DataManager;`, UI_FILE, "no-restricted-imports");
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("docs/architecture/overview.md");
	});

	it("accepts a UI file importing a service as type", async () => {
		const m = await errorsOf(`import type { DataManager } from "../services/DataManager";\nexport type X = DataManager;`, UI_FILE, "no-restricted-imports");
		expect(m).toEqual([]);
	});

	it("rejects a UI file importing from app", async () => {
		const m = await errorsOf(`import { x } from "../../../app/main";\nexport const y = x;`, UI_FILE, "no-restricted-imports");
		expect(m).toHaveLength(1);
	});

	it("rejects a service importing Notice from obsidian", async () => {
		const m = await errorsOf(`import { Notice } from "obsidian";\nexport const x = Notice;`, SERVICE_FILE, "no-restricted-imports");
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("docs/architecture/overview.md");
	});

	it("rejects a service importing UI code", async () => {
		const m = await errorsOf(`import { ListTab } from "../ui/ListTab";\nexport const x = ListTab;`, SERVICE_FILE, "no-restricted-imports");
		expect(m).toHaveLength(1);
	});

	it("rejects a service importing obsidian as namespace or default", async () => {
		const ns = await errorsOf(`import * as obsidian from "obsidian";\nexport const x = obsidian;`, SERVICE_FILE, "no-restricted-syntax");
		expect(ns).toHaveLength(1);
		expect(ns[0]?.message).toContain("docs/architecture/overview.md");
		const def = await errorsOf(`import obsidian from "obsidian";\nexport const x = obsidian;`, SERVICE_FILE, "no-restricted-syntax");
		expect(def).toHaveLength(1);
	});

	it("still allows a service to import non-UI names from obsidian", async () => {
		const m = await errorsOf(`import { normalizePath } from "obsidian";\nexport const x = normalizePath;`, SERVICE_FILE, "no-restricted-");
		expect(m).toEqual([]);
	});

	it("allows a UI file to import shared/services as a value", async () => {
		const m = await errorsOf(`import { SettingsService } from "../../../shared/services/SettingsService";\nexport const x = SettingsService;`, UI_FILE, "no-restricted-imports");
		expect(m).toEqual([]);
	});

	it("rejects new DataManager() inside a module file", async () => {
		const m = await errorsOf(`class DataManager {}\nexport const x = new DataManager();`, SERVICE_FILE, "no-restricted-syntax");
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("docs/architecture/overview.md");
	});

	it("allows new DataManager() in src/app", async () => {
		const m = await errorsOf(`class DataManager {}\nexport const x = new DataManager();`, "src/app/main.ts", "no-restricted-syntax");
		expect(m).toEqual([]);
	});

	it("keeps the inline-style rule in module files", async () => {
		const m = await errorsOf(`export const f = (el: HTMLElement) => { el.style.color = "red"; };`, UI_FILE, "no-restricted-syntax");
		expect(m).toHaveLength(1);
	});

	it("rejects an eslint-disable comment in src", async () => {
		const m = await lint(`// eslint-disable-next-line no-console -- reason\nconsole.log(1);\nexport {};`, UI_FILE);
		expect(m.some((x) => x.message.includes("noInlineConfig"))).toBe(true);
		expect(m.some((x) => x.ruleId === "no-console")).toBe(true);
	});
});
