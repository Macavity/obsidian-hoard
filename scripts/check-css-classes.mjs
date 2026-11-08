#!/usr/bin/env node
// Fails when the stylesheet (src/styles/*.css) defines a class that no source file references (dead CSS).
// Runs from `pnpm lint`; the same check is a unit test in test/cssClasses.test.ts.

import { readFileSync, readdirSync } from "fs";
import { basename, join, dirname } from "path";
import { fileURLToPath } from "url";
import process from "process";
import { checkCssClasses } from "./lib/css-classes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Classes Obsidian renders itself; the stylesheet only hooks into them. */
export const OBSIDIAN_CLASSES = [
	{ cls: "is-mobile", reason: "Body class Obsidian sets on mobile" },
	{ cls: "is-tablet", reason: "Body class Obsidian sets on tablets" },
	{ cls: "modal-content", reason: "Modal body rendered by Obsidian" },
	{ cls: "setting-item", reason: "Row rendered by Obsidian's Setting" },
	{ cls: "setting-item-description", reason: "Description rendered by Obsidian's Setting" },
	{ cls: "setting-item-name", reason: "Name rendered by Obsidian's Setting" },
	{ cls: "svg-icon", reason: "Icon element rendered by Obsidian's setIcon" },
];

export function sourceFiles(dir = join(root, "src")) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		return e.isDirectory() ? sourceFiles(p) : e.name.endsWith(".ts") ? [p] : [];
	});
}

export function stylesheetFiles(dir = join(root, "src", "styles")) {
	return readdirSync(dir).filter((f) => f.endsWith(".css")).sort().map((f) => join(dir, f));
}

/** Partials index.css does not @import: they never reach dist/styles.css, yet the class check would read them. */
export function unimportedPartials(indexCss, partials) {
	const imported = new Set([...indexCss.matchAll(/^@import "(?:\.\/)?(.+?)";/gm)].map((m) => m[1]));
	return partials.filter((f) => f !== "index.css" && !imported.has(f));
}

export function runCheck() {
	const files = stylesheetFiles();
	return {
		...checkCssClasses({
			css: files.map((p) => readFileSync(p, "utf8")).join("\n"),
			sources: sourceFiles().map((p) => readFileSync(p, "utf8")),
			allowlist: OBSIDIAN_CLASSES,
		}),
		unimported: unimportedPartials(readFileSync(join(root, "src", "styles", "index.css"), "utf8"), files.map((p) => basename(p))),
	};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const { unreferenced, staleAllowlist, unimported } = runCheck();
	if (unreferenced.length) console.error(`Dead CSS: no source references ${unreferenced.map((c) => `.${c}`).join(", ")}`);
	if (staleAllowlist.length) console.error(`Stale OBSIDIAN_CLASSES entries in scripts/check-css-classes.mjs: ${staleAllowlist.join(", ")}`);
	if (unimported.length) console.error(`Not imported by src/styles/index.css: ${unimported.join(", ")}`);
	if (unreferenced.length || staleAllowlist.length || unimported.length) process.exit(1);
	console.log("✓ Every CSS class is referenced");
}
