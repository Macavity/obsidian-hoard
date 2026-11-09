// Step "visual": every Hoard tab is screenshotted at a fixed viewport and frozen clock and compared against its baseline.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evalJs, obs, screenshot, waitFor } from "../../lib/cli.mjs";
import { click, closeModals, waitForSelector } from "../../lib/ui.mjs";
import { comparePng, cropPng } from "../../lib/visual.mjs";

export const FROZEN_NOW = "2026-06-15T12:00:00Z";
export const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 };
/** Tab names in tab-bar order (TABS in src/HoardView.ts). */
const TAB_NAMES = ["dashboard", "watchlist", "upcoming", "reading", "games", "custom-lists", "drafts", "log"];
const BASELINES = join(dirname(fileURLToPath(import.meta.url)), "..", "baselines");
const CROP_SELECTOR = ".workspace-leaf-content[data-type='hoard-view'] .view-content";
const STYLE_ID = "hoard-smoke-freeze";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

const READY = `(() => { const p = app.plugins.plugins['hoard']; return !!p && p['indexReady'] === true && !!p.dataManager && !!p.readingDataManager && !!p.gameDataManager && !!p.historyManager; })()`;
/** Commands fail with "Command … not found" while the app reloads, hence the try. */
const untilReady = () =>
	waitFor(() => {
		try {
			return evalJs(READY) === "true";
		} catch {
			return false;
		}
	}, 60000, 500);

const FREEZE_DATE = `(() => {
	const Real = Date, now = new Real(${JSON.stringify(FROZEN_NOW)}).getTime();
	class FrozenDate extends Real {
		constructor(...a) { if (a.length === 0) super(now); else super(...a); }
		static now() { return now; }
	}
	window.Date = FrozenDate;
	Math.random = () => 0.5; // the dashboard's random pick must not change between runs
	return 'ok';
})()`;
const STYLE = `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}`;
const INJECT_STYLE = `(() => { const s = document.createElement('style'); s.id = ${JSON.stringify(STYLE_ID)}; s.textContent = ${JSON.stringify(STYLE)}; document.head.appendChild(s); return 'ok'; })()`;
const REMOVE_STYLE = `(() => { document.getElementById(${JSON.stringify(STYLE_ID)})?.remove(); return 'ok'; })()`;
const TAB_STATE = (i) => `(() => {
	const btns = document.querySelectorAll('.hoard-tab-btn');
	return String(btns[${i}]?.classList.contains('is-active') === true);
})()`;
const TAB_LABELS = `JSON.stringify([...document.querySelectorAll('.hoard-tab-btn')].map((b) => b.textContent))`;
const CROP_RECT = `JSON.stringify((() => {
	const r = document.querySelector(${JSON.stringify(CROP_SELECTOR)}).getBoundingClientRect();
	return { x: r.left, y: r.top, width: r.width, height: r.height, dpr: window.devicePixelRatio };
})())`;

/** Badge counts (e.g. drafts) arrive asynchronously after the metadata scan: wait until the tab labels stop changing. */
async function settledLabels() {
	let prev = "";
	let since = Date.now();
	await waitFor(async () => {
		const now = evalJs(TAB_LABELS);
		if (now !== prev) {
			prev = now;
			since = Date.now();
		}
		return Date.now() - since >= 2000;
	}, 30000, 250);
}

/** Screenshots the Hoard view; the crop rect is read right before the shot. */
function shoot(out) {
	const file = join(out, "visual-shot.png");
	screenshot(file);
	const rect = JSON.parse(evalJs(CROP_RECT));
	return cropPng(readFileSync(file), rect, rect.dpr);
}

/** Two consecutive crops must match exactly before the tab counts as rendered. */
async function stableShot(out) {
	let prev = shoot(out);
	for (let i = 0; i < 8; i++) {
		await sleep(300);
		const next = shoot(out);
		if (prev.equals(next)) return next;
		prev = next;
	}
	return prev;
}

/** Pins viewport, clock and animations, reloads the plugin under them and opens the panel. */
async function setup() {
	cdp("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, mobile: false });
	evalJs(FREEZE_DATE);
	obs("plugin:reload", { id: "hoard" });
	await untilReady();
	evalJs(INJECT_STYLE);
	evalJs("app.commands.executeCommandById('hoard:open-panel')");
	await waitForSelector(".hoard-tab-btn");
	await waitForSelector(CROP_SELECTOR);
	await settledLabels();
}

/** Undoes setup: the full reload drops the Date stub. */
async function teardown() {
	await closeModals().catch(() => {});
	try {
		evalJs(REMOVE_STYLE);
	} catch {
		// app may be mid-reload
	}
	cdp("Emulation.clearDeviceMetricsOverride", {});
	obs("reload");
	await sleep(1500);
	await untilReady();
}

/** Writes the baseline, or compares against it and reports a mismatch through ctx.fail. */
function check(ctx, name, actual) {
	const baselinePath = join(BASELINES, `${name}.png`);
	if (ctx.updateBaselines) return writeFileSync(baselinePath, actual);
	if (!existsSync(baselinePath)) return ctx.fail(`${name}: missing baseline — run --update-baselines`);
	const res = comparePng(actual, readFileSync(baselinePath));
	if (res.ok) return;
	writeFileSync(join(ctx.out, `${name}.actual.png`), actual);
	if (res.diff) writeFileSync(join(ctx.out, `${name}.diff.png`), res.diff);
	ctx.fail(res.reason === "size" ? `${name} differs: size changed` : `${name} differs (${(res.diffRatio * 100).toFixed(2)} %)`);
}

async function shootTab(ctx, i, name) {
	await click(`.hoard-tab-btn:nth-child(${i + 1})`);
	await waitFor(() => evalJs(TAB_STATE(i)) === "true", 5000, 100);
	await sleep(500);
	check(ctx, name, await stableShot(ctx.out));
}

async function run(ctx) {
	mkdirSync(BASELINES, { recursive: true });
	try {
		await setup();
		for (const [i, name] of TAB_NAMES.entries()) await shootTab(ctx, i, name);
	} finally {
		await teardown();
	}
}

export const visualStep = { name: "visual", run };
