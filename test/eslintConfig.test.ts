import { describe, it, expect } from "vitest";
import { sentenceCaseWithoutExceptions } from "../scripts/bot-lint.mjs";
import { sentenceCaseOptions } from "../eslint.config.mjs";

describe("sentence-case exceptions", () => {
	it("has no dead ignoreRegex entry", async () => {
		const texts = (await sentenceCaseWithoutExceptions()).map((w) => w.text);
		const dead = sentenceCaseOptions.ignoreRegex.filter((re) => !texts.some((t) => new RegExp(re).test(t)));
		expect(dead).toEqual([]);
	}, 120_000);
});
