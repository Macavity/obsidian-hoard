// Integration smoke against the registered test vault: deploys the current build, runs the e2e steps, resets the vault.
// Obsidian must be running with hoard-test-vault open (`pnpm vault:open` once). Option: --only <step>.
import { ensureVault, pnpm, warnIfHidden } from "../../scripts/lib/cli.mjs";
import { closeModals } from "./ui.mjs";
import { parseArgs, runSteps } from "./runner.mjs";
import { dataStep } from "./steps/data.mjs";
import { flowsStep } from "./steps/flows.mjs";
import { scenariosStep } from "./steps/scenarios.mjs";
import { keylessStep } from "./steps/keyless.mjs";

const cleanup = async () => {
	await closeModals();
};

const opts = parseArgs(process.argv.slice(2));
let failures = [];
try {
	ensureVault();
	warnIfHidden();
	pnpm("vault:link-test"); // first: the reset seeds the folder the link points to
	pnpm("vault:reset");
	pnpm("build");
	pnpm("reload");
	failures = await runSteps([dataStep, flowsStep, scenariosStep, keylessStep], { ...opts, cleanup });
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
