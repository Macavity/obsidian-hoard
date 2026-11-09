// UI helpers for e2e flows: hit-tested clicks and real input events through the Chrome DevTools Protocol.
// Coordinates are CSS pixels relative to the viewport, exactly what getBoundingClientRect reports (no devicePixelRatio).
import { evalJs, obs, waitFor } from "./cli.mjs";

/**
 * Spike result (Obsidian 1.14.4, Electron 43 / Chrome 150, devicePixelRatio 2): `dev:cdp` accepts
 * Input.dispatchMouseEvent, Input.insertText and Input.dispatchKeyEvent. A mouse click at the centre of a Hoard tab
 * button switched the active tab, insertText filled a search input, and Escape closed a modal. Hence "cdp".
 * Caveat: `eval` through the CLI may leave document.activeElement on <body> even though the input received the text,
 * so do not assert on activeElement; assert on the input value.
 * @type {"cdp" | "dom"}
 */
export const INPUT_MODE = "cdp";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

/**
 * JS source (an expression) that scrolls the element into view and returns `{ x, y }` (its centre, rounded) or
 * `{ error: "missing" | "hidden" | "covered" }`.
 */
export function clickPointScript(selector) {
	return `(() => {
	const el = document.querySelector(${JSON.stringify(selector)});
	if (!el) return { error: "missing" };
	if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
	const rect = el.getBoundingClientRect();
	if (el.getClientRects().length === 0 || rect.width === 0 || rect.height === 0) return { error: "hidden" };
	const x = Math.round(rect.left + rect.width / 2);
	const y = Math.round(rect.top + rect.height / 2);
	const hit = document.elementFromPoint(x, y);
	if (!hit || (hit !== el && !el.contains(hit))) return { error: "covered" };
	return { x, y };
})()`;
}

function point(selector) {
	const p = JSON.parse(evalJs(`JSON.stringify(${clickPointScript(selector)})`));
	if (p.error) throw new Error(`click ${selector}: ${p.error}`);
	return p;
}

/** Clicks the centre of the element; throws if it is missing, hidden or covered. Leaves no hover state behind. */
export async function click(selector) {
	const { x, y } = point(selector);
	if (INPUT_MODE === "dom") {
		evalJs(`document.querySelector(${JSON.stringify(selector)}).click()`);
		return;
	}
	cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
	cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
	cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
	cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
}

/** Types into the focused element. */
export async function type(text) {
	if (INPUT_MODE === "dom") {
		evalJs(`(() => {
	const el = document.activeElement;
	el.value = (el.value ?? "") + ${JSON.stringify(text)};
	el.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
		return;
	}
	cdp("Input.insertText", { text });
}

const KEYS = {
	Enter: { code: "Enter", vk: 13 },
	Escape: { code: "Escape", vk: 27 },
	Tab: { code: "Tab", vk: 9 },
};

/** Presses a key on the focused element. */
export async function press(key) {
	const k = KEYS[key];
	if (!k) throw new Error(`press: unsupported key ${key}`);
	if (INPUT_MODE === "dom") {
		evalJs(`(() => {
	const el = document.activeElement ?? document.body;
	for (const type of ["keydown", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key: ${JSON.stringify(key)}, bubbles: true }));
})()`);
		return;
	}
	const base = { key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
	cdp("Input.dispatchKeyEvent", { type: "keyDown", ...(key === "Enter" ? { text: "\r" } : {}), ...base });
	cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

/** Waits until the element exists and is visible. */
export async function waitForSelector(selector, timeoutMs = 10000) {
	await waitFor(
		() =>
			evalJs(`(() => {
	const el = document.querySelector(${JSON.stringify(selector)});
	return String(!!el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0);
})()`) === "true",
		timeoutMs,
	);
}

const MODAL_COUNT = "String(document.querySelectorAll('.modal-container').length)";
const CLICK_CLOSE = `(() => {
	const close = document.querySelector('.modal-container .modal-close-button');
	if (close) close.click();
	return String(!!close);
})()`;

/** Closes all modals: the close button if present, else Escape. */
export async function closeModals() {
	for (let i = 0; i < 10 && evalJs(MODAL_COUNT) !== "0"; i++) {
		if (evalJs(CLICK_CLOSE) !== "true") await press("Escape");
		await sleep(300);
	}
}
