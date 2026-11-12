// Captures the state catalogue into $VISUAL_OUT/<label>/<variant>/<id>.{png,json}.
// Usage: node test/visual/shots.mjs <label> [--only <id-prefix>] [--variants light-desktop,dark-desktop,light-phone,dark-phone] [--screenshots]
// Default: style dumps of light-desktop only, which leaves the Obsidian window in the background.
// --screenshots adds a PNG per state and brings the window to the front for each one.
// Obsidian must be running with hoard-test-vault open (see CONTRIBUTING.md, Testing).
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { ensureVault, evalJs, obs, waitFor } from "../../scripts/lib/cli.mjs";
import { capture, clearViewport, stabilise } from "./capture.mjs";
import { STATES } from "./states.mjs";

const ALL_VARIANTS = ["light-desktop", "dark-desktop", "light-phone", "dark-phone"];
const pnpm = (...a) => execFileSync("pnpm", a, { stdio: "inherit" });
const outRoot = () => resolve(process.env.VISUAL_OUT ?? join(tmpdir(), "hoard-visual"));
const messageOf = (e) => (e instanceof Error ? e.message : String(e));

function readArgs(argv) {
	const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { only: { type: "string", default: "" }, variants: { type: "string", default: "light-desktop" }, screenshots: { type: "boolean", default: false } } });
	const variants = values.variants.split(",").filter(Boolean);
	const unknown = variants.filter((v) => !ALL_VARIANTS.includes(v));
	if (positionals.length !== 1 || unknown.length > 0) {
		throw new Error(`usage: node test/visual/shots.mjs <label> [--only <id-prefix>] [--variants <${ALL_VARIANTS.join(",")}>] [--screenshots]${unknown.length ? ` (unknown: ${unknown})` : ""}`);
	}
	return { label: positionals[0], only: values.only, variants, screenshot: values.screenshots };
}

/** `dev:mobile` reloads the app; until it is back, every CLI command answers "Command … not found". */
function untilReady() {
	return waitFor(
		() => {
			try {
				return evalJs("app.plugins.plugins['hoard']?.indexReady === true && app.workspace.layoutReady ? 'ok' : 'no'") === "ok";
			} catch {
				return false;
			}
		},
		30000,
		500,
	);
}

async function setScheme(variant) {
	const dark = variant.startsWith("dark");
	evalJs(`(app.changeTheme(${dark ? "'obsidian'" : "'moonstone'"}), 'ok')`);
	await waitFor(() => evalJs("String(document.body.classList.contains('theme-dark'))") === String(dark), 10000, 200);
	await sleep(500);
}

/** One retry: a click that lands on a window still repainting is the only flakiness left. */
async function captureWithRetry(state, dir, opts) {
	try {
		await capture(state, dir, opts);
	} catch (e) {
		console.warn(`  retry ${state.id}: ${messageOf(e)}`);
		await capture(state, dir, opts);
	}
}

/** Captures `states` of one variant; a state that fails is recorded and the others still run. */
async function runVariant(variant, { states, label, screenshot }, failures) {
	await setScheme(variant);
	const dir = join(outRoot(), label, variant);
	for (const state of states) {
		try {
			await captureWithRetry(state, dir, { screenshot });
			console.log(`  ok   ${variant}/${state.id}`);
		} catch (e) {
			failures.push(`${variant}/${state.id}: ${messageOf(e)}`);
			console.error(`  FAIL ${variant}/${state.id}: ${messageOf(e)}`);
		}
	}
}

async function capturePhones(variants, run, failures) {
	obs("dev:mobile", { on: true });
	await sleep(1500);
	await untilReady();
	await stabilise({ phone: true });
	for (const variant of variants) {
		await runVariant(variant, { ...run, states: run.states.filter((s) => s.phone) }, failures);
	}
}

/** Leaves Obsidian as found; problems join `failures` instead of replacing the one that got us here. */
async function restore({ mobile, theme }, failures) {
	const attempt = async (what, fn) => {
		try {
			await fn();
		} catch (e) {
			failures.push(`${what} failed: ${messageOf(e)}`);
		}
	};
	if (mobile) {
		await attempt("dev:mobile off", async () => {
			clearViewport();
			obs("dev:mobile", { off: true });
			await sleep(1500);
			await untilReady();
		});
	}
	await attempt("restoring the colour scheme", () => evalJs(`(app.changeTheme(${JSON.stringify(theme)}), 'ok')`));
	await attempt("clearing the viewport", () => clearViewport());
	// Obsidian saves the colour scheme with a delay; a reset before that write would leave appearance.json modified
	await sleep(3000);
	await attempt("final vault:reset", () => pnpm("vault:reset"));
	// stabilise() replaced the clock, Math.random and the image and observer classes of the window; only a reload undoes that
	await attempt("reloading Obsidian", async () => {
		obs("reload");
		await sleep(2000);
		await untilReady();
	});
}

/** Desktop variants first, then the phone ones (they need the app in mobile emulation, which reloads it). */
async function captureAll({ variants, ...run }, found, failures) {
	await untilReady();
	found.theme = evalJs("String(app.vault.getConfig('theme'))");
	const desktop = variants.filter((v) => v.endsWith("-desktop"));
	const phone = variants.filter((v) => v.endsWith("-phone"));
	if (desktop.length > 0) await stabilise();
	for (const variant of desktop) await runVariant(variant, run, failures);
	if (phone.length > 0) {
		found.mobile = true;
		await capturePhones(phone, run, failures);
	}
}

function deploy() {
	ensureVault();
	pnpm("vault:link-test"); // first: the reset seeds the folder the link points to
	pnpm("vault:reset");
	pnpm("build");
	pnpm("reload");
}

async function main() {
	const { label, only, variants, screenshot } = readArgs(process.argv.slice(2));
	// without --screenshots the window stays in the background, where `foreground` states cannot render
	const states = STATES.filter((s) => s.id.startsWith(only) && (screenshot || !s.foreground));
	if (states.length === 0) throw new Error(`no state matches --only ${only}`);
	const failures = [];
	const found = { mobile: false, theme: "system" };
	deploy();
	try {
		await captureAll({ variants, states, label, screenshot }, found, failures);
	} catch (e) {
		failures.push(`shots aborted: ${messageOf(e)}`);
	} finally {
		await restore(found, failures);
	}
	if (failures.length > 0) {
		console.error(`${failures.length} problem(s):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
		process.exit(1);
	}
	console.log(`shots ok: ${join(outRoot(), label)}`);
}

await main();
