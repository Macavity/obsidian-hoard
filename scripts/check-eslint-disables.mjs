#!/usr/bin/env node
// Checks every eslint-disable directive under src/ the way the Obsidian review bot does:
// a description (`-- reason`) is required, and the rules in DISALLOWED_RULES may not be disabled.
// Exit 1 with a list of offenders, else 0.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DISALLOWED_RULES, findDisableIssues } from "./lib/eslint-disables.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");

const files = existsSync(srcDir)
	? readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts")).map((f) => join(srcDir, f))
	: [];

const offenders = files.flatMap((file) => {
	const lines = readFileSync(file, "utf8").split("\n");
	return findDisableIssues(lines).map((issue) => ({ file: relative(root, file).replace(/\\/g, "/"), ...issue }));
});

if (offenders.length === 0) {
	console.log("✓ eslint-disable directives are described and allowed");
	process.exit(0);
}

console.error("\n❌ Problems with eslint-disable directives:\n");
for (const { file, line, content, problem } of offenders) {
	console.error(`  ${file}:${line}  ${problem}`);
	console.error(`    ${content}\n`);
}
console.error("Every directive needs a description: // eslint-disable-next-line rule -- reason");
console.error(`These rules can never be disabled: ${DISALLOWED_RULES.join(", ")}`);
console.error("See .claude/skills/obsidian-ops/references/scorecard-compliance.md for how to fix them.\n");
process.exit(1);
