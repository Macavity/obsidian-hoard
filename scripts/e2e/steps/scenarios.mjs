// Step "scenarios": WatchLog import end to end. Each scenario swaps the test vault's content, the wizard imports it, the vault is restored.
import { failWithScreenshot } from "../failure.mjs";
import { prepareScenario, RestoreError } from "../scenario.mjs";
import { run as runOriginal } from "../scenarios/watchlog-original/flow.mjs";
import { run as runFork } from "../scenarios/watchlog-fork/flow.mjs";

const SCENARIOS = [
	["watchlog-original", runOriginal],
	["watchlog-fork", runFork],
];

async function runOne(name, flow, ctx) {
	const s = await prepareScenario(name);
	try {
		await flow(ctx);
	} catch (e) {
		failWithScreenshot(ctx, name, e, `scenario-${name}`);
	} finally {
		await s.restore();
	}
}

async function run(ctx) {
	for (const [name, flow] of SCENARIOS) {
		try {
			await runOne(name, flow, ctx);
		} catch (e) {
			ctx.fail(`${name}: ${e instanceof Error ? e.message : String(e)}`);
			if (e instanceof RestoreError) break; // the next scenario would back up this one's WatchLog data as the user's
		}
	}
}

export const scenariosStep = { name: "scenarios", run };
