import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createFakeApp } from "./fakes/fakeApp";
import { importContext } from "./import/watchlog/helpers";
import { LocalStore } from "../src/storage/LocalStore";
import { detectWatchLogSources, type WatchLogSourceKind } from "../src/import/watchlog/detect";
import { createImporter } from "../src/import/watchlog/importer";
import { scenarioDir } from "../scripts/e2e/scenario.mjs";
import { EXPECT as ORIGINAL } from "../scripts/e2e/scenarios/watchlog-original/expect.mjs";
import { EXPECT as FORK } from "../scripts/e2e/scenarios/watchlog-fork/expect.mjs";

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** The scenario's vault/ in a FakeApp: `.obsidian/` files are adapter files, the rest are vault notes. */
function loadScenario(name: string) {
	const root = join(scenarioDir(name), "vault");
	const files: Record<string, string> = {};
	const adapter: Record<string, string> = {};
	for (const abs of walk(root)) {
		const rel = relative(root, abs).split("\\").join("/");
		(rel.startsWith(".obsidian/") ? adapter : files)[rel] = readFileSync(abs, "utf8");
	}
	const f = createFakeApp(files);
	for (const [p, c] of Object.entries(adapter)) f.adapterFiles.set(p, c);
	return f;
}

describe.each([
	["watchlog-original", ORIGINAL],
	["watchlog-fork", FORK],
] as const)("scenario %s", (name, EXPECT) => {
	it("is detected and imports the expected titles", async () => {
		const f = loadScenario(name);
		const sources = await detectWatchLogSources(f.app);
		const kind = EXPECT.kind as WatchLogSourceKind;
		const src = sources[kind];
		expect(src).not.toBeNull();
		const types = kind === "fork" ? sources.fork!.typeNames : (sources.original!.data.settings.types ?? []).map((t) => t.name);
		const ctx = importContext(f, new LocalStore(f.plugin), "Hoard", types);
		const importer = createImporter({ app: f.app, local: new LocalStore(f.plugin), ctx: () => ctx, layout: () => ctx.layout, openFile: () => {} }, sources);
		const report = await importer.run(kind, () => {});
		expect(report.errors).toEqual([]);
		const titles = [...f.files.keys()].filter((p) => ctx.layout.classify(p)?.kind === "title");
		expect(titles).toHaveLength(EXPECT.titles);
		const note = f.files.get(EXPECT.sample.path) ?? "";
		for (const v of [EXPECT.sample.title, EXPECT.sample.type, EXPECT.sample.status]) expect(note).toContain(v);
	});
});
