// Approximates the community plugin scanner locally. Informational, never a gate.
// Source of the adjustments below: "Community plugin scanner configuration" in
// https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md
// The scanner itself is not public, so this is a reading of that page, applied to the
// plugin version installed here; it can lag behind the scanner.
import { execFileSync } from "node:child_process";
import { ESLint } from "eslint";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

/** Files and directories the scanner does not lint. */
const SCANNER_IGNORES = [
	"**/node_modules/**", "**/dist/**", "**/build/**", "**/pkg/**",
	"**/.obsidian/**", "**/test-vault/**",
	"esbuild.config.mjs", "version-bump.mjs",
	"**/*.test.*", "**/*.tests.*", "**/*.spec.*", "**/*.specs.*",
	"**/test/**", "**/tests/**", "**/__tests__/**",
	"**/mocks/**", "**/__mocks__/**", "**/testUtils*", "**/testUtils*/**",
	"**/*.cjs", "**/*.mjs", "**/*.cts", "**/*.mts",
	"**/vite*",
	"**/scripts/**", "**/docs/**",
	"**/i18n/**", "**/i18next/**", "**/locale/**", "**/locales/**", "**/translations/**", "**/l10n/**",
	"automation/**", "**/e2e/**", "**/e2e-tests/**", "**/*.e2e.*",
];

/** Rules the scanner switches off. */
const OFF = [
	"no-undef", "import/no-unresolved",
	"@typescript-eslint/restrict-template-expressions", "@typescript-eslint/no-base-to-string",
	"obsidianmd/validate-manifest", "obsidianmd/validate-license",
	"obsidianmd/ui/sentence-case", "obsidianmd/ui/sentence-case-json", "obsidianmd/ui/sentence-case-locale-module",
];

/** Errors for every plugin. */
const ERROR_ALWAYS = new Set([
	"no-eval", "no-implied-eval", "@typescript-eslint/no-implied-eval", "no-new-func",
	"no-unsanitized/method", "no-unsanitized/property",
	"obsidianmd/regex-lookbehind", "obsidianmd/no-forbidden-elements",
	"eslint-comments/no-unlimited-disable",
]);

/** Errors in the strictest layer, the one a newly submitted plugin is checked with. */
const ERROR_NEWEST = new Set([
	"eslint-comments/require-description", "eslint-comments/disable-enable-pair", "eslint-comments/no-restricted-disable",
	"obsidianmd/settings-tab/no-manual-html-headings", "obsidianmd/settings-tab/no-problematic-settings-headings",
	"obsidianmd/sample-names", "obsidianmd/no-sample-code", "obsidianmd/platform", "obsidianmd/no-plugin-as-component",
	"obsidianmd/detach-leaves", "obsidianmd/no-static-styles-assignment", "obsidianmd/no-view-references-in-plugin",
	"obsidianmd/no-unsupported-api",
]);

/** Reported as recommendations, which weigh less than warnings. */
const RECOMMENDATION = new Set([
	"@typescript-eslint/no-deprecated", "@typescript-eslint/no-unused-vars", "@typescript-eslint/no-namespace",
	"@typescript-eslint/prefer-as-const", "@typescript-eslint/prefer-namespace-keyword",
	"obsidianmd/prefer-abstract-input-suggest",
]);

/** How the scanner files a finding of `ruleId`. */
export function scannerLevel(ruleId) {
	if (ERROR_ALWAYS.has(ruleId) || ERROR_NEWEST.has(ruleId)) return "error";
	return RECOMMENDATION.has(ruleId) ? "recommendation" : "warning";
}

/** The plugin's config with every rule bound to TypeScript files, as eslint.config.mjs does. */
const withFiles = (configs) => configs.map((config) => (config.rules ? { ...config, files: config.files ?? ["**/*.ts"] } : config));

const parserConfig = {
	files: ["**/*.ts"],
	languageOptions: { parser: tsparser, parserOptions: { project: "./tsconfig.json", sourceType: "module" } },
};

/**
 * What the scanner would report for the tracked source files, by our reading of its documented configuration.
 * @returns {Promise<{ ruleId: string, level: "error" | "warning" | "recommendation", file: string, line: number, message: string }[]>}
 */
export async function scannerFindings() {
	const eslint = new ESLint({
		cwd: process.cwd(), // repo root: pnpm scripts and vitest both start there
		overrideConfigFile: true,
		overrideConfig: [
			{ ignores: SCANNER_IGNORES },
			...withFiles(obsidianmd.configs.recommended),
			parserConfig,
			{ files: ["**/*.ts"], rules: Object.fromEntries(OFF.map((rule) => [rule, "off"])) },
		],
	});
	const tracked = execFileSync("git", ["ls-files", "*.ts", "*.js"], { encoding: "utf8" }).split("\n").filter(Boolean);
	const results = await eslint.lintFiles(tracked);
	return results.flatMap((result) =>
		result.messages
			.filter((m) => m.ruleId)
			.map((m) => ({ ruleId: m.ruleId, level: scannerLevel(m.ruleId), file: result.filePath, line: m.line, message: m.message })),
	);
}

if (process.argv[1]?.endsWith("bot-lint.mjs")) {
	const findings = await scannerFindings();
	const counts = new Map();
	for (const f of findings) counts.set(`${f.level}\t${f.ruleId}`, (counts.get(`${f.level}\t${f.ruleId}`) ?? 0) + 1);
	if (process.argv.includes("--list")) {
		for (const f of findings) console.log(`${f.file.replace(process.cwd() + "/", "")}:${f.line}\t${f.level}\t${f.ruleId}\t${f.message}`);
	}
	for (const [key, n] of [...counts].sort()) console.log(`${n}\t${key}`);
	for (const level of ["error", "warning", "recommendation"]) console.log(`${findings.filter((f) => f.level === level).length}\t${level}s`);
}
