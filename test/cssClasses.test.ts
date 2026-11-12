import process from "process";
import { describe, it, expect } from "vitest";
import { BEM_PATTERN, checkCssClasses, classesInCss, shortTokens, wordsInStrings } from "../scripts/lib/css-classes.mjs";
import { runCheck, unimportedPartials } from "../scripts/check-css-classes.mjs";
import { bundleStyles } from "../scripts/lib/bundle-styles.mjs";
import stylelintConfig from "../stylelint.config.mjs";
import { readFileSync } from "fs";
import { join } from "path";

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

	it("reports stylesheet partials index.css does not import", () => {
		const index = '@import "./base.css";\n@import "list.css";\n';
		expect(unimportedPartials(index, ["base.css", "index.css", "list.css", "orphan.css"])).toEqual(["orphan.css"]);
	});

	it("passes on the repository", () => {
		expect(runCheck()).toMatchObject({ unreferenced: [], staleAllowlist: [], unimported: [] });
	});

	it("flags short name parts outside the allow list", () => {
		expect(shortTokens(["hoard-xy-table", "hoard-btn--sm", "hoard-custom-list__td", "hoard-card__pct", "is-active"])).toEqual(["hoard-card__pct", "hoard-xy-table"]);
	});

	it("accepts BEM names only", () => {
		for (const ok of ["hoard-card", "hoard-card__title", "hoard-btn--sm", "hoard-trailer-btn__label--muted"]) expect(ok).toMatch(BEM_PATTERN);
		for (const bad of ["hoard-card__a__b", "hoard-Card", "card", "hoard-card_title", "hoard-card---x"]) expect(bad).not.toMatch(BEM_PATTERN);
	});

	it("reports naming findings without failing the default check", () => {
		expect(runCheck()).toMatchObject({ shortTokens: expect.any(Array) as unknown, notBem: expect.any(Array) as unknown });
	});

	it("bundles the partials in index.css order", () => {
		const dir = join("src", "styles");
		const order = [...readFileSync(join(dir, "index.css"), "utf8").matchAll(/^@import "(.+?)";/gm)].map((m) => m[1]!);
		const expected = order.map((rel) => readFileSync(join(dir, rel), "utf8")).join("");
		expect(bundleStyles(join(dir, "index.css"))).toBe(expected);
	});
});

describe("stylelint config", () => {
	it("keeps the import notation the bundler parses", () => {
		const rules = (stylelintConfig as { rules: Record<string, unknown> }).rules;
		expect(rules["import-notation"]).toBe("string");
		expect(rules["no-descending-specificity"]).toBeNull();
		expect(bundleStyles(join(process.cwd(), "src", "styles", "index.css"))).not.toMatch(/^@import/m);
	});

	it("judges Hoard classes like the class check and lets foreign ones pass", () => {
		const [pattern] = (stylelintConfig as { rules: Record<string, unknown> }).rules["selector-class-pattern"] as [string, unknown];
		const re = new RegExp(pattern);
		for (const name of ["hoard-card", "hoard-card__title", "hoard-btn--sm", "hoard-card__a__b", "hoard-Card", "hoard-card_title"]) {
			expect(re.test(name), name).toBe(BEM_PATTERN.test(name));
		}
		for (const foreign of ["is-active", "modal-content", "theme-dark"]) expect(foreign).toMatch(re);
	});
});
