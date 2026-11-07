import { describe, it, expect } from "vitest";
import { checkCssClasses, classesInCss, wordsInStrings } from "../scripts/lib/css-classes.mjs";
import { runCheck } from "../scripts/check-css-classes.mjs";

describe("css class check", () => {
	it("collects classes from selectors only", () => {
		const css = `/* .comment */ .a .b:hover, .c::before { content: ".d"; width: .5em; }\n@media (max-width: 700px) { .e { color: red; } }`;
		expect([...classesInCss(css)].sort()).toEqual(["a", "b", "c", "e"]);
	});

	it("collects words from string and template literals", () => {
		const src = `el.createDiv({ cls: "x-one x-two" }); el.toggleClass('x-three', on); const t = \`x-four \${n}\`; // x-five`;
		expect([...wordsInStrings([src])].sort()).toEqual(["n", "x-four", "x-one", "x-three", "x-two"]);
	});

	it("reports unreferenced classes and stale allowlist entries", () => {
		const out = checkCssClasses({
			css: ".used {} .dead {} .core {} .gone-core {}",
			sources: ['createDiv({ cls: "used" }); addClass("gone-core")'],
			allowlist: [{ cls: "core", reason: "Obsidian" }, { cls: "gone-core", reason: "now referenced" }, { cls: "missing", reason: "no longer styled" }],
		});
		expect(out).toEqual({ unreferenced: ["dead"], staleAllowlist: ["gone-core", "missing"] });
	});

	it("passes on the repository", () => {
		expect(runCheck()).toEqual({ unreferenced: [], staleAllowlist: [] });
	});
});
