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
