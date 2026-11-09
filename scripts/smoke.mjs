// Integration smoke against the registered test vault: deploys the current build, runs the e2e steps, resets the vault.
// Obsidian must be running with hoard-test-vault open (`pnpm vault:open` once). Options: --only <step>, --update-baselines.
import { execFileSync } from "node:child_process";
import { ensureVault } from "./lib/cli.mjs";
import { closeModals } from "./lib/ui.mjs";
import { parseArgs, runSteps } from "./e2e/runner.mjs";
import { dataStep } from "./e2e/steps/data.mjs";
import { flowsStep } from "./e2e/steps/flows.mjs";
import { scenariosStep } from "./e2e/steps/scenarios.mjs";
import { visualStep } from "./e2e/steps/visual.mjs";

const pnpm = (...a) => execFileSync("pnpm", a, { stdio: "inherit" });

const cleanup = async () => {
	await closeModals();
};

const opts = parseArgs(process.argv.slice(2));
let failures = [];
try {
	ensureVault();
	pnpm("vault:link-test"); // first: the reset seeds the folder the link points to
	pnpm("vault:reset");
	pnpm("build");
	pnpm("reload");
	failures = await runSteps([dataStep, visualStep, flowsStep, scenariosStep], { ...opts, cleanup });
} catch (e) {
	failures.push(`smoke: ${e instanceof Error ? e.message : String(e)}`);
} finally {
	try {
		pnpm("vault:reset");
	} catch (e) {
		failures.push(`smoke: final reset failed: ${e instanceof Error ? e.message : String(e)}`);
	}
}
if (failures.length > 0) {
	console.error(`smoke failed:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
	process.exit(1);
}
console.log("smoke ok");
