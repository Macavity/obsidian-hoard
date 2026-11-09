// Step runner for the smoke test: runs steps in order, collects failures instead of aborting, cleans up after each step.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function parseArgs(argv) {
	const i = argv.indexOf("--only");
	return { only: i >= 0 ? (argv[i + 1] ?? null) : null, updateBaselines: argv.includes("--update-baselines") };
}

export async function runSteps(steps, opts) {
	const failures = [];
	const selected = opts.only === null ? steps : steps.filter((s) => s.name === opts.only);
	if (opts.only !== null && selected.length === 0) return [`smoke: unknown step ${opts.only}`];
	const out = opts.out ?? process.env.SMOKE_OUT ?? join(tmpdir(), "hoard-smoke");
	mkdirSync(out, { recursive: true });
	for (const step of selected) {
		const ctx = { out, updateBaselines: opts.updateBaselines, fail: (msg) => failures.push(`${step.name}: ${msg}`) };
		try {
			await step.run(ctx);
		} catch (e) {
			failures.push(`${step.name}: ${e instanceof Error ? e.message : String(e)}`);
		}
		try {
			await opts.cleanup();
		} catch (e) {
			failures.push(`${step.name}: cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return failures;
}
