// Integration smoke against the registered test vault: deploys the current build, runs the e2e steps, resets the vault.
// Obsidian must be running with hoard-test-vault open (`pnpm vault:open` once). Options: --only <step>, --update-baselines.
import { execFileSync } from "node:child_process";
import { ensureVault, evalJs } from "./lib/cli.mjs";
import { parseArgs, runSteps } from "./e2e/runner.mjs";
import { dataStep } from "./e2e/steps/data.mjs";

const pnpm = (...a) => execFileSync("pnpm", a, { stdio: "inherit" });

/** Closes modals a step left open: close button if present, otherwise Escape. */
const CLOSE_MODALS = `(() => {
	const modals = document.querySelectorAll('.modal-container');
	modals.forEach((m) => {
		const close = m.querySelector('.modal-close-button');
		if (close) close.click();
		else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
	return String(modals.length);
})()`;
const cleanup = async () => {
	evalJs(CLOSE_MODALS);
};

const opts = parseArgs(process.argv.slice(2));
let failures = [];
try {
	ensureVault();
	pnpm("vault:link-test"); // first: the reset seeds the folder the link points to
	pnpm("vault:reset");
	pnpm("build");
	pnpm("reload");
	failures = await runSteps([dataStep], { ...opts, cleanup });
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
