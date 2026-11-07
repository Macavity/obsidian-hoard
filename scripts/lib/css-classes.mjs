// Pure checks for dead CSS: every class selector in the stylesheet must be referenced by a
// string literal in the plugin source, unless it is an Obsidian class the stylesheet hooks into.
// (fallow's css-dead-surface only scans markup files, so it never sees Obsidian's `cls:` option.)

const WORD = /[A-Za-z_-][\w-]*/g;

/** Class names used in selectors of `css` (declaration blocks and comments ignored). */
export function classesInCss(css) {
	const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const out = new Set();
	for (const chunk of noComments.split("}")) {
		const parts = chunk.split("{");
		const selectors = parts.slice(0, -1).join(" ").replace(/"[^"]*"|'[^']*'/g, "");
		for (const m of selectors.matchAll(/\.([A-Za-z_-][\w-]*)/g)) out.add(m[1]);
	}
	return out;
}

/** Words inside string and template literals of the given source texts. */
export function wordsInStrings(sources) {
	const out = new Set();
	for (const src of sources) {
		for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
			const text = m[1] ?? m[2] ?? m[3] ?? "";
			for (const w of text.match(WORD) ?? []) out.add(w);
		}
	}
	return out;
}

/**
 * Compares the stylesheet with the sources. `allowlist` holds `{ cls, reason }` entries for classes
 * Obsidian itself renders. Returns the unreferenced classes and allowlist entries that are no longer needed.
 */
export function checkCssClasses({ css, sources, allowlist }) {
	const classes = classesInCss(css);
	const words = wordsInStrings(sources);
	const allowed = new Set(allowlist.map((a) => a.cls));
	const unreferenced = [...classes].filter((c) => !words.has(c) && !allowed.has(c)).sort();
	const staleAllowlist = allowlist.filter((a) => !classes.has(a.cls) || words.has(a.cls)).map((a) => a.cls).sort();
	return { unreferenced, staleAllowlist };
}
