// Pure comparison logic and HTML report for the visual-regression tool.
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * @typedef {{ path: string, text: string, style: Record<string, string> }[]} StyleDump
 * @typedef {{ path: string, kind: "added" | "removed" | "text" | "style", props?: { name: string, before: string, after: string }[] }} StyleDiffEntry
 * @typedef {{ id: string, styleDiff: StyleDiffEntry[], pixels: { changed: number, total: number }, note?: { verdict: "expected" | "open", reason: string } }} State
 */

const MAX_PROPS = 40;

/**
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 */
function changedProps(before, after) {
	const names = new Set([...Object.keys(before), ...Object.keys(after)]);
	const props = [];
	for (const name of names) {
		const b = before[name] ?? "";
		const a = after[name] ?? "";
		if (a !== b) props.push({ name, before: b, after: a });
	}
	return props;
}

/**
 * Diff two style dumps, matching elements by path.
 * @param {StyleDump} before
 * @param {StyleDump} after
 * @returns {StyleDiffEntry[]}
 */
export function diffDumps(before, after) {
	const beforeByPath = new Map(before.map((e) => [e.path, e]));
	const afterByPath = new Map(after.map((e) => [e.path, e]));
	/** @type {StyleDiffEntry[]} */
	const out = [];
	for (const e of after) {
		const old = beforeByPath.get(e.path);
		if (!old) {
			out.push({ path: e.path, kind: "added" });
			continue;
		}
		if (old.text !== e.text) out.push({ path: e.path, kind: "text" });
		const props = changedProps(old.style, e.style);
		if (props.length > 0) out.push({ path: e.path, kind: "style", props });
	}
	for (const e of before) {
		if (!afterByPath.has(e.path)) out.push({ path: e.path, kind: "removed" });
	}
	return out;
}

/**
 * Pixel diff of two PNGs.
 * @param {Buffer} beforePng
 * @param {Buffer} afterPng
 * @returns {{ changed: number, total: number, diffPng: Buffer }}
 */
export function diffPixels(beforePng, afterPng) {
	const a = PNG.sync.read(beforePng);
	const b = PNG.sync.read(afterPng);
	if (a.width !== b.width || a.height !== b.height) {
		const total = Math.max(a.width * a.height, b.width * b.height);
		return { changed: total, total, diffPng: afterPng };
	}
	const diff = new PNG({ width: a.width, height: a.height });
	const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
	return { changed, total: a.width * a.height, diffPng: PNG.sync.write(diff) };
}

/**
 * @param {State[]} states
 * @returns {{ changed: State[], unchangedCount: number }}
 */
export function buildReport(states) {
	const changed = states.filter((s) => s.styleDiff.length > 0 || s.pixels.changed > 0);
	changed.sort((x, y) => y.pixels.changed - x.pixels.changed);
	return { changed, unchangedCount: states.length - changed.length };
}

/** @param {unknown} s */
function esc(s) {
	const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
	return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

/** @param {StyleDiffEntry[]} diff */
function renderChanges(diff) {
	/** @type {string[]} */
	const rows = [];
	for (const d of diff) {
		if (d.kind === "style") {
			for (const p of d.props ?? []) {
				rows.push(`<li><code>${esc(d.path)}</code> ${esc(p.name)}: ${esc(p.before)} &rarr; ${esc(p.after)}</li>`);
			}
		} else {
			rows.push(`<li><code>${esc(d.path)}</code> ${esc(d.kind)}</li>`);
		}
	}
	const shown = rows.slice(0, MAX_PROPS).join("");
	const more = rows.length > MAX_PROPS ? `<li class="more">+${rows.length - MAX_PROPS} more</li>` : "";
	return `<ul class="changes">${shown}${more}</ul>`;
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#d0d0d0;--card:#f6f6f6;--accent:#2563eb}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--fg:#e8e8e8;--muted:#999;--line:#3a3a3a;--card:#222;--accent:#6ea0ff}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px}h2{font-size:16px;margin:0 0 8px}
section{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;margin:16px 0}
.pair{display:flex;gap:12px;flex-wrap:wrap}.pair figure{margin:0;flex:1 1 280px}
figcaption,.meta{color:var(--muted);font-size:12px}
img{max-width:100%;border:1px solid var(--line);background:var(--bg)}
.blend{position:relative;display:inline-block;margin-top:8px}
.blend img.top{position:absolute;left:0;top:0;opacity:.5}
.blend img.diff{position:absolute;left:0;top:0;display:none}
.blend.show-diff img.diff{display:block}
.verdict{font-weight:600}.verdict.expected{color:#16a34a}.verdict.open{color:#d97706}
code{font-size:12px}.changes{padding-left:18px}.more{color:var(--muted)}
`;

const JS = `
document.querySelectorAll("section[data-state]").forEach(function(s){
	var blend=s.querySelector(".blend"),top=s.querySelector("img.top"),range=s.querySelector("input[type=range]"),tog=s.querySelector("input[type=checkbox]");
	range.addEventListener("input",function(){top.style.opacity=range.value/100});
	tog.addEventListener("change",function(){blend.classList.toggle("show-diff",tog.checked)});
});
`;

/** Pixel count, side-by-side pair and blend slider of one state. */
function renderImages(s, img) {
	const pct = s.pixels.total > 0 ? ((s.pixels.changed / s.pixels.total) * 100).toFixed(2) : "0.00";
	return `<div class="meta">${s.pixels.changed} of ${s.pixels.total} pixels changed (${pct}%)</div>
<div class="pair">
<figure><img src="${esc(img.before)}" alt="before"><figcaption>before</figcaption></figure>
<figure><img src="${esc(img.after)}" alt="after"><figcaption>after</figcaption></figure>
</div>
<div class="blend"><img src="${esc(img.before)}" alt="blend before"><img class="top" src="${esc(img.after)}" alt="blend after"><img class="diff" src="${esc(img.diff)}" alt="diff"></div>
<div><label>blend <input type="range" min="0" max="100" value="50"></label>
<label><input type="checkbox"> show diff</label></div>`;
}

/**
 * @param {{ changed: State[], unchangedCount: number }} report
 * @param {(id: string) => { before: string, after: string, diff: string } | undefined} images absent for a state captured without screenshots
 * @returns {string}
 */
export function renderReportHtml(report, images) {
	const sections = report.changed.map((s) => {
		const img = images(s.id);
		const verdict = s.note?.verdict ?? "open";
		const reason = s.note?.reason ?? "";
		return `<section id="${esc(s.id)}" data-state="${esc(s.id)}">
<h2><a href="#${esc(s.id)}">${esc(s.id)}</a></h2>
${img ? renderImages(s, img) : '<div class="meta">style dump only, no screenshot</div>'}
<p><span class="verdict ${esc(verdict)}">${esc(verdict)}</span> ${esc(reason)}</p>
${renderChanges(s.styleDiff)}
</section>`;
	});
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual report</title><style>${CSS}</style></head>
<body><h1>Visual report</h1>
<p class="meta">${report.changed.length} changed, ${report.unchangedCount} unchanged</p>
${sections.join("\n")}
<script>${JS}</script></body></html>
`;
}

/** Path of the element that holds `path` in a dump: pseudo elements hang off their element, others off the path prefix. */
function parentPath(path) {
	const pseudo = path.indexOf("::");
	if (pseudo >= 0) return path.slice(0, pseudo);
	const cut = path.lastIndexOf("/");
	return cut < 0 ? null : path.slice(0, cut);
}

/**
 * Lossless compact form of a dump for storing on disk: every element keeps only the properties that differ from its
 * parent's, and values are interned. A full dump is ~1500 properties per element.
 * @param {StyleDump} dump
 */
export function compactDump(dump) {
	/** @type {string[]} */
	const props = [];
	const propIndex = new Map();
	/** @type {string[]} */
	const values = [];
	const valueIndex = new Map();
	const intern = (list, index, v) => {
		let i = index.get(v);
		if (i === undefined) {
			i = list.length;
			list.push(v);
			index.set(v, i);
		}
		return i;
	};
	/** @type {Map<string, Record<string, string>>} */
	const styles = new Map();
	const els = dump.map((e) => {
		styles.set(e.path, e.style);
		const parentPathKey = parentPath(e.path);
		const parent = (parentPathKey !== null && styles.get(parentPathKey)) || {};
		/** @type {number[]} */
		const d = [];
		for (const name of Object.keys(e.style)) {
			const v = e.style[name];
			if (parent[name] !== v) d.push(intern(props, propIndex, name), intern(values, valueIndex, v));
		}
		for (const name of Object.keys(parent)) {
			if (!(name in e.style)) d.push(intern(props, propIndex, name), -1);
		}
		return { path: e.path, text: e.text, d };
	});
	return { v: 1, props, values, els };
}

/**
 * Inverse of compactDump.
 * @param {ReturnType<typeof compactDump>} compact
 * @returns {StyleDump}
 */
export function expandDump(compact) {
	/** @type {Map<string, Record<string, string>>} */
	const styles = new Map();
	return compact.els.map((e) => {
		const parentPathKey = parentPath(e.path);
		const style = { ...((parentPathKey !== null && styles.get(parentPathKey)) || {}) };
		for (let i = 0; i < e.d.length; i += 2) {
			const name = compact.props[e.d[i]];
			const vi = e.d[i + 1];
			if (vi < 0) delete style[name];
			else style[name] = compact.values[vi];
		}
		styles.set(e.path, style);
		return { path: e.path, text: e.text, style };
	});
}

/**
 * Diff-ready states from two label maps; `before`/`after` are Maps of `<variant>/<id>` to anything.
 * @param {Iterable<string>} beforeKeys
 * @param {Iterable<string>} afterKeys
 * @returns {{ key: string, inBefore: boolean, inAfter: boolean }[]}
 */
export function pairStates(beforeKeys, afterKeys) {
	const b = new Set(beforeKeys);
	const a = new Set(afterKeys);
	return [...new Set([...b, ...a])].sort().map((key) => ({ key, inBefore: b.has(key), inAfter: a.has(key) }));
}

/**
 * Merges a notes file (`{ "<variant>/<id>": { verdict, reason } }`) into report states; unknown ids are ignored.
 * @param {State[]} states
 * @param {Record<string, { verdict: "expected" | "open", reason: string }>} notes
 * @returns {State[]}
 */
export function mergeNotes(states, notes) {
	return states.map((s) => (notes[s.id] ? { ...s, note: notes[s.id] } : s));
}
