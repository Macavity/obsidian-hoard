import { describe, it, expect } from "vitest";
import { findDisableIssues } from "../scripts/lib/eslint-disables.mjs";

describe("eslint-disable checks", () => {
  it("accepts a directive with a -- description", () => {
    expect(findDisableIssues(["// eslint-disable-next-line no-console -- cli output"])).toEqual([]);
  });

  it("accepts a description on the previous comment line", () => {
    const lines = ["// reason: the API has no types", "// eslint-disable-next-line @typescript-eslint/no-unsafe-call"];
    expect(findDisableIssues(lines)).toEqual([]);
  });

  it("reports a directive without a description", () => {
    const issues = findDisableIssues(["const a = 1;", "// eslint-disable-next-line no-console"]);
    expect(issues).toEqual([{ line: 2, content: "// eslint-disable-next-line no-console", problem: "missing description" }]);
  });

  it("reports disallowed rules, also inside a comma-separated list", () => {
    const line = "// eslint-disable-next-line no-console, @typescript-eslint/no-explicit-any -- legacy";
    expect(findDisableIssues([line])).toEqual([
      { line: 1, content: line, problem: 'rule "@typescript-eslint/no-explicit-any" cannot be disabled' },
    ]);
  });

  it("reports both problems of one line", () => {
    const line = "// eslint-disable-next-line obsidianmd/no-static-styles-assignment";
    expect(findDisableIssues([line]).map((i: { problem: string }) => i.problem)).toEqual([
      "missing description",
      'rule "obsidianmd/no-static-styles-assignment" cannot be disabled',
    ]);
  });

  it("does not match a rule name that is only a prefix", () => {
    expect(findDisableIssues(["// eslint-disable-next-line obsidianmd/ui/sentence-case-x -- ok"])).toEqual([]);
  });

  it("ignores lines without a directive", () => {
    expect(findDisableIssues(["// eslint is great", "let x;"])).toEqual([]);
  });
});
