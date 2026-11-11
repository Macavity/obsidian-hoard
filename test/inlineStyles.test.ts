import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { sourceFiles } from "../scripts/check-css-classes.mjs";

const files = sourceFiles as () => string[];
const COLOR = /\.style\.(backgroundColor|color|borderColor|stroke|backgroundImage)\b/;

describe("inline styles", () => {
	it("sets no colour through element.style", () => {
		const hits = files().filter((p) => !p.endsWith(".test.ts") && COLOR.test(readFileSync(p, "utf8")));
		expect(hits).toEqual([]);
	});
});

describe("inline geometry", () => {
	it("sets no geometry through element.style", () => {
		const GEO = /\.style\.(width|height|top|left|paddingTop|cssText|setProperty|removeProperty|getPropertyValue)\b/;
		const hits = files().filter((p) => !p.endsWith(".test.ts") && GEO.test(readFileSync(p, "utf8")));
		expect(hits).toEqual([]);
	});

	it("passes only custom properties to setCssProps", () => {
		const hits = files().filter((p) => !p.endsWith(".test.ts") && /setCssProps\(\{\s*(?!\s|['"]--|\[)[^}]/.test(readFileSync(p, "utf8")));
		expect(hits).toEqual([]);
	});
});

describe("element.style", () => {
	it("has no element.style access left", () => {
		const hits = files().filter((p) => !p.endsWith(".test.ts") && /\.style\b(?!\w)/.test(readFileSync(p, "utf8").replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")));
		expect(hits).toEqual([]);
	});
});
