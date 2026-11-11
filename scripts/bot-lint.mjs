// Runs ESLint over src/ the way the Obsidian review bot does: the plugin's
// recommended config with its default sentence-case options, none of the local
// exceptions from eslint.config.mjs. Informational, never a gate.
import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

const SENTENCE_CASE_RULES = new Set([
	"obsidianmd/ui/sentence-case",
	"obsidianmd/ui/sentence-case-locale-module",
]);

/** The string value a message points at: the source between its start and end, evaluated. */
export function flaggedText(source, m) {
	const offset = (line, column) => source.split("\n").slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0) + column - 1;
	const raw = source.slice(offset(m.line, m.column), offset(m.endLine ?? m.line, m.endColumn ?? m.column));
	const literal = raw.replace(/^[\w$]+\s*:\s*/, ""); // locale entries are `key: 'text'`
	try {
		return String(new Function(`return (${literal})`)());
	} catch {
		return literal;
	}
}

/**
 * Sentence-case warnings the review bot would report for src/.
 * @returns {Promise<{ ruleId: string, text: string, file: string, line: number, message: string }[]>}
 */
export async function botWarnings() {
	const eslint = new ESLint({
		cwd: process.cwd(), // repo root: pnpm scripts and vitest both start there
		overrideConfigFile: true,
		overrideConfig: [
			...obsidianmd.configs.recommendedWithLocalesEn.map((config) =>
				config.rules ? { ...config, files: config.files ?? ["**/*.ts"] } : config,
			),
			{
				files: ["**/*.ts"],
				languageOptions: {
					parser: tsparser,
					parserOptions: { project: "./tsconfig.json", sourceType: "module" },
				},
			},
		],
	});
	const results = await eslint.lintFiles(["src/**/*.ts"]);
	const sources = new Map(results.map((r) => [r.filePath, readFileSync(r.filePath, "utf8")]));
	return results.flatMap((result) =>
		result.messages
			.filter((m) => m.ruleId && SENTENCE_CASE_RULES.has(m.ruleId))
			.map((m) => ({
				ruleId: m.ruleId,
				text: flaggedText(sources.get(result.filePath) ?? "", m),
				file: result.filePath,
				line: m.line,
				message: m.message,
			})),
	);
}

if (process.argv[1]?.endsWith("bot-lint.mjs")) {
	const warnings = await botWarnings();
	const counts = new Map();
	for (const w of warnings) counts.set(w.ruleId, (counts.get(w.ruleId) ?? 0) + 1);
	if (process.argv.includes("--list")) {
		for (const w of warnings) console.log(`${w.file.replace(process.cwd() + "/", "")}:${w.line}\t${w.ruleId}\t${JSON.stringify(w.text)}`);
	}
	for (const [rule, n] of counts) console.log(`${n}\t${rule}`);
	console.log(`${warnings.length}\ttotal`);
}
