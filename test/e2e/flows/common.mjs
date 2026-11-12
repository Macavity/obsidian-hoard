// Shared helpers of the click flows. Everything that performs an action goes through test/e2e/ui.mjs; evalJs only reads.
import { assert, evalJs, obs, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, press, waitForSelector } from "../ui.mjs";

const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

/** Runs an Obsidian command by id (the programmatic equivalent of the command palette entry). */
export function runCommand(id) {
	evalJs(`app.commands.executeCommandById(${JSON.stringify(id)})`);
}

/** Clicks the watchlist tab button (2nd tab) after opening the panel. */
async function openWatchlist() {
	runCommand("hoard:open-panel");
	await waitForSelector(".hoard-tab-bar__btn");
	await click(".hoard-tab-bar__btn:nth-child(2)");
	await waitFor(() => evalJs(`String(document.querySelector(".hoard-tab-bar__btn.is-active") === document.querySelector(".hoard-tab-bar__btn:nth-child(2)"))`) === "true", 10000);
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
	await waitForSelector(".hoard-detail");
	await waitStable(".modal:has(.hoard-detail)");
}

/** Shortest prefix of `label` that no other label starts with (case-insensitive); the whole label if none is unique. */
export function typeAheadPrefix(label, others) {
	const lower = others.map((o) => o.toLowerCase());
	let n = 1;
	while (n < label.length && lower.some((o) => o.startsWith(label.slice(0, n).toLowerCase()))) n++;
	return label.slice(0, n);
}

/**
 * Picks an option of a native `<select>` by value, by type-ahead: a click focuses the select, then the shortest unique
 * prefix of the option's label is typed key by key. What the click does beyond focusing depends on the platform. Under
 * CDP the native popup stays closed on macOS and typing changes the value at once. On Windows the popup opens, typing only
 * highlights the option and Enter commits it. So Enter follows only while the value is still the old one: on a closed
 * select it would go to the modal instead. A select that already holds the value is left alone, as there is nothing to
 * commit and the popup would stay open.
 */
export async function chooseOption(selector, value) {
	const current = () => evalJs(`document.querySelector(${JSON.stringify(selector)}).value`);
	const labels = JSON.parse(evalJs(`JSON.stringify([...document.querySelector(${JSON.stringify(selector)}).options].map((o) => [o.value, o.text]))`));
	const label = labels.find(([v]) => v === value)?.[1];
	assert(label !== undefined, `option ${value} missing in ${selector}`);
	if (current() === value) return;
	const prefix = typeAheadPrefix(label, labels.filter(([v]) => v !== value).map(([, t]) => t));
	await click(selector);
	for (const ch of prefix) {
		cdp("Input.dispatchKeyEvent", { type: "keyDown", key: ch, text: ch, unmodifiedText: ch });
		cdp("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
	}
	if (current() !== value) await press("Enter");
	assert(current() === value, `${selector}: expected ${value}, got ${current()}`);
}
