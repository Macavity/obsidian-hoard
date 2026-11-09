import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, runSteps } from "../scripts/e2e/runner.mjs";

type Ctx = { fail(msg: string): void };
const out = () => mkdtempSync(join(tmpdir(), "hoard-runner-"));

describe("smoke runner", () => {
	it("parses --only and --update-baselines", () => {
		expect(parseArgs(["--only", "visual", "--update-baselines"])).toEqual({ only: "visual", updateBaselines: true });
		expect(parseArgs([])).toEqual({ only: null, updateBaselines: false });
	});
	it("collects failures, keeps going and always cleans up", async () => {
		const cleanup = vi.fn(async () => {});
		const ran: string[] = [];
		const failures = await runSteps([
			{ name: "a", run: () => { ran.push("a"); return Promise.reject(new Error("boom")); } },
			{ name: "b", run: (ctx: Ctx) => { ran.push("b"); ctx.fail("soft"); return Promise.resolve(); } },
		], { only: null, updateBaselines: false, cleanup, out: out() });
		expect(ran).toEqual(["a", "b"]);
		expect(failures).toEqual(["a: boom", "b: soft"]);
		expect(cleanup).toHaveBeenCalledTimes(2);
	});
	it("runs only the selected step", async () => {
		const ran: string[] = [];
		await runSteps([{ name: "a", run: () => { ran.push("a"); return Promise.resolve(); } }, { name: "b", run: () => { ran.push("b"); return Promise.resolve(); } }],
			{ only: "b", updateBaselines: false, cleanup: async () => {}, out: out() });
		expect(ran).toEqual(["b"]);
	});
	it("reports an unknown --only step", async () => {
		const failures = await runSteps([{ name: "a", run: () => Promise.resolve() }], { only: "x", updateBaselines: false, cleanup: async () => {}, out: out() });
		expect(failures).toEqual(["smoke: unknown step x"]);
	});
});
