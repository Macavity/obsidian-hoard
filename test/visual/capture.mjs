// Capture one UI state: stabilises the app, runs the state's setup, then writes a computed-style dump and a screenshot.
// Everything here talks to a running Obsidian through scripts/lib/cli.mjs; it is never imported by the unit tests.
import { setTimeout as sleep } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evalJs, obs, screenshot, waitFor } from "../../scripts/lib/cli.mjs";
import { closeModals, waitForSelector } from "../e2e/ui.mjs";
import { compactDump } from "./compare.mjs";

const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false };
const PHONE = { width: 360, height: 800, deviceScaleFactor: 2, mobile: true };
/** Fixed "now" for the page: Thu 2026-01-15 12:00 local. */
const CLOCK = [2026, 0, 15, 12, 0, 0];

const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

const FREEZE_CSS =
	"*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";

/** In-page part of stabilise(): idempotent, so it can run again after every app reload. */
const STABILISE_JS = `(() => {
	const w = window;
	if (!w.__visualClock) {
		const Real = w.Date;
		const fixed = new Real(...${JSON.stringify(CLOCK)}).getTime();
		class FrozenDate extends Real {
			constructor(...a) {
				if (a.length === 0) super(fixed);
				else super(...a);
			}
			static now() { return fixed; }
		}
		w.Date = FrozenDate;
		w.__visualClock = true;
	}
	if (!w.__visualRandom) {
		// the dashboard shuffles its suggestion: a constant keeps the pick the same however often anything else asked
		Math.random = () => 0.5;
		w.__visualRandom = true;
	}
	if (!w.__visualObserver) {
		// lazy poster and cover fetching hits the network; its observers (rooted in the Hoard view) never fire
		const Real = w.IntersectionObserver;
		w.IntersectionObserver = class extends Real {
			constructor(callback, options) {
				super(options?.root?.closest?.('.workspace-leaf-content[data-type="hoard-view"]') ? () => {} : callback, options);
			}
		};
		w.__visualObserver = true;
	}
	if (!w.__visualImages) {
		// remote images (posters, avatars) would load or fail depending on the network: swap them for one fixed pixel
		const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
		const remote = (v) => /^https?:/i.test(String(v));
		const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
		Object.defineProperty(HTMLImageElement.prototype, 'src', {
			configurable: true,
			get: desc.get,
			set(v) { desc.set.call(this, remote(v) ? pixel : v); },
		});
		const setAttribute = Element.prototype.setAttribute;
		Element.prototype.setAttribute = function (name, v) {
			return setAttribute.call(this, name, this instanceof HTMLImageElement && String(name).toLowerCase() === 'src' && remote(v) ? pixel : v);
		};
		w.__visualImages = true;
	}
	if (!document.querySelector('style[data-visual]')) {
		const s = document.createElement('style');
		s.setAttribute('data-visual', '');
		s.textContent = ${JSON.stringify(FREEZE_CSS)};
		document.head.appendChild(s);
	}
	if (!w.__visualMutations) {
		w.__visualMutations = { n: 0 };
		new MutationObserver((list) => { w.__visualMutations.n += list.length; })
			.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
	}
	const plugin = app.plugins.plugins['hoard'];
	// no network: cards keep their placeholder instead of waiting for a poster that never arrives
	if (plugin && plugin.posterService && !plugin.posterService.__visualStub) {
		plugin.posterService.enqueue = () => Promise.resolve(null);
		plugin.posterService.__visualStub = true;
	}
	return plugin ? 'ok' : 'no-plugin';
})()`;

/**
 * In-page statement: orders the entry index by id. Ties in a sort (equal dates) fall back to the order the notes were
 * indexed in, which depends on how fast the vault was read.
 */
export const SORT_INDEX_JS = `(() => {
	const map = app.plugins.plugins['hoard'].index.entries;
	const sorted = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	map.clear();
	for (const [key, slot] of sorted) map.set(key, slot);
	return 'ok';
})()`;

/**
 * Makes the app deterministic: fixed viewport, no animations or caret, frozen clock, no poster fetching.
 * Safe to call repeatedly; call it again after anything that reloads the app (`dev:mobile on|off`).
 * @param {{ phone?: boolean }} [opts]
 */
export async function stabilise(opts = {}) {
	const metrics = opts.phone ? PHONE : DESKTOP;
	cdp("Emulation.setDeviceMetricsOverride", metrics);
	await waitFor(() => evalJs("String(innerWidth)") === String(metrics.width), 8000, 200);
	await waitFor(() => evalJs(STABILISE_JS) === "ok", 15000, 300);
	// badges (drafts) count from the metadata cache: wait until every note is in it, then let them redraw
	await waitFor(
		() => evalJs("String(app.vault.getMarkdownFiles().every((f) => app.metadataCache.getFileCache(f) != null))") === "true",
		30000,
		300,
	);
	await sleep(2000);
	evalJs(SORT_INDEX_JS);
	await primeDraftsBadge();
	// widgets and the status bar computed "today" before the clock was frozen
	evalJs("document.dispatchEvent(new CustomEvent('hoard-data-changed'))");
	await sleep(300);
}

/**
 * The Drafts badge starts from a rough count and only settles once the Drafts tab has rendered; whether that happened yet
 * depends on timing. Visiting the tab once makes every later state see the settled count.
 */
async function primeDraftsBadge() {
	evalJs("app.commands.executeCommandById('hoard:open-panel')");
	await waitFor(
		() =>
			evalJs(`(() => {
	const leaf = app.workspace.getLeavesOfType('hoard-view')[0];
	if (!leaf) return 'false';
	if (leaf.isDeferred) void leaf.loadIfDeferred();
	return String(typeof leaf.view.setActiveTab === 'function' && document.querySelectorAll('.hoard-tab-btn').length > 0);
})()`) === "true",
		30000,
		300,
	);
	evalJs("app.workspace.getLeavesOfType('hoard-view')[0].view.setActiveTab('drafts')");
	await sleep(1500);
}

/**
 * The Hoard tab is the active one unless a modal or a note is open, and nothing keeps keyboard focus: a leftover focus
 * ring or an inactive tab header would differ from run to run.
 */
function settleFocus() {
	evalJs(`(() => {
	const leaf = app.workspace.getLeavesOfType('hoard-view')[0];
	if (leaf && !leaf.isDeferred && !document.querySelector('.modal-container') && app.workspace.getLeavesOfType('markdown').length === 0) {
		app.workspace.setActiveLeaf(leaf, { focus: true });
	}
	document.activeElement?.blur?.();
	return 'ok';
})()`);
}

/** Moves the pointer out of the way: hover states, tooltips and scrollbar thumbs would differ from run to run. */
async function parkMouse() {
	cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
	await sleep(250);
}

/** Clears the viewport override that stabilise() set. */
export function clearViewport() {
	cdp("Emulation.clearDeviceMetricsOverride", {});
}

/** Waits for two animation frames, loaded fonts and a DOM that stopped changing. */
async function settle() {
	evalJs(`(() => {
		window.__visualFrames = 0;
		window.__visualFonts = false;
		requestAnimationFrame(() => requestAnimationFrame(() => { window.__visualFrames = 2; }));
		document.fonts.ready.then(() => { window.__visualFonts = true; });
		return 'ok';
	})()`);
	await waitFor(() => evalJs("String(window.__visualFrames === 2 && window.__visualFonts)") === "true", 10000, 100);
	let last = -1;
	await waitFor(
		async () => {
			const n = Number(evalJs("String(window.__visualMutations.n)"));
			const quiet = n === last;
			last = n;
			if (!quiet) await sleep(250);
			return quiet;
		},
		15000,
		50,
	);
}

/** In-page walk of the subtree: path, own text and every computed property, no class names or ids. */
function dumpScript(rootSelector) {
	return `(() => {
	const root = document.querySelector(${JSON.stringify(rootSelector)});
	if (!root) return 'null';
	const out = [];
	const props = (cs) => {
		const style = {};
		for (let i = 0; i < cs.length; i++) style[cs[i]] = cs.getPropertyValue(cs[i]);
		return style;
	};
	const walk = (el, path) => {
		const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).filter(Boolean).join(' ');
		out.push({ path, text, style: props(getComputedStyle(el)) });
		for (const pseudo of ['::before', '::after']) {
			const cs = getComputedStyle(el, pseudo);
			const content = cs.getPropertyValue('content');
			if (content === 'none' || content === 'normal' || content === '') continue;
			out.push({ path: path + pseudo, text: content, style: props(cs) });
		}
		let index = 0;
		for (const child of el.children) {
			walk(child, path + '/' + child.tagName.toLowerCase() + '[' + index + ']');
			index++;
		}
	};
	walk(root, root.tagName.toLowerCase() + '[0]');
	return JSON.stringify(out);
})()`;
}

/**
 * Computed-style dump of `rootSelector` and everything below it, in document order.
 * @param {string} rootSelector
 * @returns {{ path: string, text: string, style: Record<string, string> }[]}
 */
function dumpStyles(rootSelector) {
	const raw = evalJs(dumpScript(rootSelector));
	if (raw === "null") throw new Error(`dump: ${rootSelector} not found`);
	return JSON.parse(raw);
}

/** Every state starts with the same tabs: whatever an earlier state or run left open is closed, except the Hoard view. */
function keepOnlyHoardTab() {
	evalJs(`(() => {
	app.workspace.iterateRootLeaves((leaf) => {
		if (leaf.getViewState().type !== 'hoard-view') leaf.detach();
	});
	return 'ok';
})()`);
}

/**
 * Runs the state's setup and writes `<outDir>/<id>.json` and, on request, `<outDir>/<id>.png`, then tears it down.
 * @param {{ id: string, root: string, setup: () => Promise<void>, teardown?: () => Promise<void> }} state
 * @param {string} outDir
 * @param {{ screenshot?: boolean }} [opts] a screenshot brings the Obsidian window to the front; the dump alone does not
 */
export async function capture(state, outDir, opts = {}) {
	mkdirSync(outDir, { recursive: true });
	try {
		await closeModals();
		keepOnlyHoardTab();
		await state.setup();
		await waitForSelector(state.root, 15000);
		settleFocus();
		await parkMouse();
		await settle();
		const dump = dumpStyles(state.root);
		writeFileSync(join(outDir, `${state.id}.json`), JSON.stringify(compactDump(dump)));
		if (opts.screenshot) screenshot(join(outDir, `${state.id}.png`));
	} finally {
		try {
			await state.teardown?.();
		} catch (e) {
			console.warn(`teardown of ${state.id} failed: ${e.message}`);
		}
		await closeModals();
	}
}
