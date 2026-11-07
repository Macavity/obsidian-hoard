// Pure checks for eslint-disable directives, mirroring the Obsidian review bot:
// every directive needs a description, and some rules may never be disabled.

/** Rules the Obsidian bot refuses to see disabled; fix the underlying issue instead. */
export const DISALLOWED_RULES = [
	"obsidianmd/no-static-styles-assignment",
	"@typescript-eslint/no-explicit-any",
	"obsidianmd/ui/sentence-case",
];

const hasDescription = /--\s+.+/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rulePatterns = DISALLOWED_RULES.map((rule) => ({ rule, re: new RegExp(`(?:^|[, ])${escape(rule)}(?:[, ]|$)`) }));

function describedByPreviousLine(prev) {
	const t = prev.trim();
	return t.startsWith("//") && (hasDescription.test(t) || t.toLowerCase().includes("reason"));
}

/** Returns `{ line, content, problem }` for every offending directive in `lines` (1-based line numbers). */
export function findDisableIssues(lines) {
	const issues = [];
	lines.forEach((raw, i) => {
		if (!raw.includes("eslint-disable")) return;
		const content = raw.trim();
		if (!hasDescription.test(raw) && !describedByPreviousLine(lines[i - 1] ?? "")) {
			issues.push({ line: i + 1, content, problem: "missing description" });
		}
		for (const { rule, re } of rulePatterns) {
			if (re.test(raw)) issues.push({ line: i + 1, content, problem: `rule "${rule}" cannot be disabled` });
		}
	});
	return issues;
}
