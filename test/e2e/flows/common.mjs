// Shared helpers of the click flows. Everything that performs an action goes through test/e2e/ui.mjs; evalJs only reads.
import { assert, evalJs, obs, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, waitForSelector } from "../ui.mjs";

const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

/** Runs an Obsidian command by id (the programmatic equivalent of the command palette entry). */
export function runCommand(id) {
	evalJs(`app.commands.executeCommandById(${JSON.stringify(id)})`);
}

/** Clicks the watchlist tab button (2nd tab) after opening the panel. */
async function openWatchlist() {
	runCommand("hoard:open-panel");
	await waitForSelector(".hoard-tab-btn");
	await click(".hoard-tab-btn:nth-child(2)");
	await waitFor(() => evalJs(`String(document.querySelector(".hoard-tab-btn.is-active") === document.querySelector(".hoard-tab-btn:nth-child(2)"))`) === "true", 10000);
}

/** Waits until the element's box stays put across two polls (modal open animation, async re-render). */
export async function waitStable(selector, timeoutMs = 10000) {
	let last = "";
	try {
		await waitFor(() => {
			const now = evalJs(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return ""; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].join(); })()`);
			const stable = now !== "" && now === last;
			last = now;
			return stable;
		}, timeoutMs, 200);
	} catch (e) {
		throw new Error(last === "" ? `${selector}: missing` : `${selector}: not stable (${e.message})`);
	}
}

/** Opens the detail modal of a watchlist card (data-title-id = `<Type>/<Title>`). */
export async function openDetail(titleId) {
	await openWatchlist();
	await waitForSelector(`[data-title-id="${titleId}"]`);
	await click(`[data-title-id="${titleId}"]`);
	await waitForSelector(".hoard-detail-modal");
	await waitStable(".modal:has(.hoard-detail-modal)");
}

/** Shortest prefix of `label` that no other label starts with (case-insensitive); the whole label if none is unique. */
export function typeAheadPrefix(label, others) {
	const lower = others.map((o) => o.toLowerCase());
	let n = 1;
	while (n < label.length && lower.some((o) => o.startsWith(label.slice(0, n).toLowerCase()))) n++;
	return label.slice(0, n);
}

/**
 * Picks an option of a native `<select>` by value, by type-ahead: clicking focuses the select (the native popup does not
 * open under CDP), then the shortest unique prefix of the option's label is typed key by key.
 */
export async function chooseOption(selector, value) {
	const labels = JSON.parse(evalJs(`JSON.stringify([...document.querySelector(${JSON.stringify(selector)}).options].map((o) => [o.value, o.text]))`));
	const label = labels.find(([v]) => v === value)?.[1];
	assert(label !== undefined, `option ${value} missing in ${selector}`);
	const prefix = typeAheadPrefix(label, labels.filter(([v]) => v !== value).map(([, t]) => t));
	await click(selector);
	for (const ch of prefix) {
		cdp("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
		cdp("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
	}
	const got = evalJs(`document.querySelector(${JSON.stringify(selector)}).value`);
	assert(got === value, `${selector}: expected ${value}, got ${got}`);
}
