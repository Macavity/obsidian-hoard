import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";
import process from "node:process";

// Layer rules inside modules (docs/architecture/overview.md). Real file paths, so type-aware linting resolves them.
// With CI=true typescript-eslint infers single-run mode, which assumes file contents never differ from disk; the
// lintText calls below lint code that is not on disk under those paths, so single-run mode reports nothing.
process.env.TSESTREE_SINGLE_RUN = "false";
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
	// The first lintText builds the TypeScript program for type-aware rules; on CI that exceeds the 5 s test timeout.
	beforeAll(async () => {
		await lint("export {};", UI_FILE);
	}, 60_000);

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

	it("rejects a service importing the design system", async () => {
		const m = await errorsOf(`import { ConfirmModal } from "../../../design-system/ConfirmModal";\nexport const x = ConfirmModal;`, SERVICE_FILE, "no-restricted-imports");
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
		const m = await errorsOf(`import { HistoryManager } from "../../../shared/services/HistoryManager";\nexport const x = HistoryManager;`, UI_FILE, "no-restricted-imports");
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

	describe("constructor injection guards", () => {
		const DOC = "docs/architecture/overview.md";

		it("rejects *Deps interfaces and type aliases", async () => {
			const i = await errorsOf(`export interface FooDeps { a: number }`, UI_FILE, "no-restricted-syntax");
			expect(i).toHaveLength(1);
			expect(i[0]?.message).toContain(DOC);
			const t = await errorsOf(`export type FooDeps = { a: number };`, SERVICE_FILE, "no-restricted-syntax");
			expect(t).toHaveLength(1);
			expect(await errorsOf(`export interface FooPort { a: number }`, UI_FILE, "no-restricted-syntax")).toEqual([]);
		});

		it("rejects the identifier deps, also in src/app", async () => {
			const m = await errorsOf(`export const f = (deps: number) => deps;`, "src/app/main.ts", "no-restricted-syntax");
			expect(m.length).toBeGreaterThan(0);
			expect(m[0]?.message).toContain(DOC);
			expect(await errorsOf(`export const f = (dep: number) => dep;`, UI_FILE, "no-restricted-syntax")).toEqual([]);
		});

		it("rejects this.app in modules and shared, allows it in src/app", async () => {
			const code = `export class X { app = 1; f() { return this.app; } }`;
			const ui = await errorsOf(code, UI_FILE, "no-restricted-syntax");
			expect(ui).toHaveLength(1);
			expect(ui[0]?.message).toContain(DOC);
			expect(await errorsOf(code, SERVICE_FILE, "no-restricted-syntax")).toHaveLength(1);
			expect(await errorsOf(code, "src/design-system/RowsCustomizeModal.ts", "no-restricted-syntax")).toHaveLength(1);
			expect(await errorsOf(code, "src/app/main.ts", "no-restricted-syntax")).toEqual([]);
		});

		it("rejects importing App in services, storage and api, allows it in src/app", async () => {
			const code = `import { App } from "obsidian";\nexport type X = App;`;
			for (const file of [SERVICE_FILE, "src/shared/services/HistoryManager.ts", "src/shared/storage/VaultLayout.ts", "src/shared/api/ApiService.ts"]) {
				const m = await errorsOf(code, file, "no-restricted-imports");
				expect(m, file).toHaveLength(1);
				expect(m[0]?.message).toContain(DOC);
			}
			expect(await errorsOf(code, "src/app/main.ts", "no-restricted-imports")).toEqual([]);
		});

		it("rejects a rest parameter in a constructor, allows it elsewhere", async () => {
			const ctor = await errorsOf(`export class X { constructor(...parts: number[]) { void parts; } }`, UI_FILE, "no-restricted-syntax");
			expect(ctor).toHaveLength(1);
			expect(ctor[0]?.message).toContain(DOC);
			expect(await errorsOf(`export const f = (...parts: number[]) => parts;`, UI_FILE, "no-restricted-syntax")).toEqual([]);
		});
	});
});

describe("module exports barrel", () => {
	const A = "src/modules/airtime/ui/AirtimeTab.ts";
	const S = "src/shared/domain/date.ts";
	const D = "src/design-system/ActionBar.ts";
	const E = "src/modules/watchlist/exports.ts";
	const APP = "src/app/main.ts";
	const T = "test/DataManager.test.ts";
	// import-x/no-restricted-paths: the barrel; no-restricted-syntax: the shape of exports.ts
	const hits = (code: string, file: string) => errorsOf(code, file, file === E ? "no-restricted-syntax" : "no-restricted-paths");

	beforeAll(async () => {
		await lint("export {};", A);
	}, 60_000);

	it("rejects importing another module's internals", async () => {
		const m = await hits(`import { x } from "../../watchlist/domain/titles";\nexport const y = x;`, A);
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("exports-reviewer");
		expect(m[0]?.message).toContain("docs/architecture/overview.md");
	});

	it("rejects a type import past the barrel", async () => {
		expect(await hits(`import type { X } from "../../watchlist/domain/model";\nexport type Y = X;`, A)).toHaveLength(1);
	});

	it("rejects a side-effect import past the barrel", async () => {
		expect(await hits(`import "../../watchlist/domain/titles";`, A)).toHaveLength(1);
	});

	it("rejects a dynamic import past the barrel", async () => {
		expect(await hits(`export const m = () => import("../../watchlist/ui/ListTab");`, A)).toHaveLength(1);
	});

	it("rejects re-exporting another module's internals", async () => {
		expect(await hits(`export { x } from "../../watchlist/domain/titles";`, A)).toHaveLength(1);
	});

	it("rejects export * of another module's internals", async () => {
		expect(await hits(`export * from "../../watchlist/domain/titles";`, A)).toHaveLength(1);
	});

	it("accepts the barrel, also with .ts", async () => {
		const code = `import { x } from "../../watchlist/exports";\nimport { y } from "../../watchlist/exports.ts";\nexport const z = [x, y];`;
		expect(await hits(code, A)).toEqual([]);
	});

	it("accepts own-module internals", async () => {
		expect(await hits(`import { x } from "../domain/airtime";\nexport const y = x;`, A)).toEqual([]);
	});

	it("rejects shared past the barrel", async () => {
		expect(await hits(`import type { X } from "../../modules/watchlist/domain/model";\nexport type Y = X;`, S)).toHaveLength(1);
	});

	it("rejects the design system past the barrel", async () => {
		expect(await hits(`import { x } from "../modules/reading/domain/readingColors";\nexport const y = x;`, D)).toHaveLength(1);
	});

	it("allows app and test to reach internals", async () => {
		expect(await hits(`import { ReadingDataManager } from "../modules/reading/services/ReadingDataManager";\nexport const x = ReadingDataManager;`, APP)).toEqual([]);
		expect(await hits(`import { ReadingDataManager } from "../src/modules/reading/services/ReadingDataManager";\nexport const x = ReadingDataManager;`, T)).toEqual([]);
	});

	it("accepts named re-exports in exports.ts", async () => {
		expect(await hits(`export { a } from "./domain/titles";\nexport type { T } from "./domain/model";`, E)).toEqual([]);
	});

	it("rejects a definition in exports.ts", async () => {
		const m = await hits(`export const A = 1;`, E);
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("only re-exports by name");
	});

	it("rejects export * in exports.ts", async () => {
		expect(await hits(`export * from "./domain/titles";\nexport type * from "./domain/model";`, E)).toHaveLength(2);
	});

	it("rejects import-then-export in exports.ts", async () => {
		expect(await hits(`import { a } from "./domain/titles";\nexport { a };`, E)).toHaveLength(2);
	});

	it("rejects a foreign re-export in exports.ts", async () => {
		const m = await hits(`export { a } from "../reading/exports";`, E);
		expect(m).toHaveLength(1);
		expect(m[0]?.message).toContain("own module");
	});
});
