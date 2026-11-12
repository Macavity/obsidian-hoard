// Compares two captures of shots.mjs and writes an HTML report.
// Usage: node test/visual/diff.mjs <before> <after> [--notes <file>]
// Exit code 1 when anything changed. Notes: JSON { "<variant>/<id>": { "verdict": "expected" | "open", "reason": "…" } }.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildReport, diffDumps, diffPixels, expandDump, mergeNotes, pairStates, renderReportHtml } from "./compare.mjs";

const root = resolve(process.env.VISUAL_OUT ?? join(tmpdir(), "hoard-visual"));

function readArgs(argv) {
	const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { notes: { type: "string", default: "" } } });
	if (positionals.length !== 2) throw new Error("usage: node test/visual/diff.mjs <before> <after> [--notes <file>]");
	return { before: positionals[0], after: positionals[1], notes: values.notes };
}

/** `<variant>/<id>` keys of one capture. */
function listCapture(label) {
	const dir = join(root, label);
	if (!existsSync(dir)) throw new Error(`no capture at ${dir}`);
	return readdirSync(dir, { withFileTypes: true })
		.filter((variant) => variant.isDirectory())
		.flatMap((variant) => readdirSync(join(dir, variant.name)).filter((f) => f.endsWith(".json")).map((f) => `${variant.name}/${f.slice(0, -5)}`));
}

const readDump = (label, key) => expandDump(JSON.parse(readFileSync(join(root, label, `${key}.json`), "utf8")));
/** Absent when the capture ran without --screenshots. */
const readPng = (label, key) => {
	const file = join(root, label, `${key}.png`);
	return existsSync(file) ? readFileSync(file) : null;
};
const dataUri = (png) => `data:image/png;base64,${png.toString("base64")}`;

/** A state present on one side only counts as changed. */
function lonelyState(key, label, removed, images) {
	const png = readPng(label, key);
	if (png) images.set(key, { before: dataUri(png), after: dataUri(png), diff: dataUri(png) });
	return { id: key, styleDiff: [{ path: removed ? "(state removed)" : "(state added)", kind: removed ? "removed" : "added" }], pixels: { changed: 1, total: 1 } };
}

function comparedState(key, before, after, images) {
	const styleDiff = diffDumps(readDump(before, key), readDump(after, key));
	const beforePng = readPng(before, key);
	const afterPng = readPng(after, key);
	if (!beforePng || !afterPng) return { id: key, styleDiff, pixels: { changed: 0, total: 0 } };
	const px = diffPixels(beforePng, afterPng);
	images.set(key, { before: dataUri(beforePng), after: dataUri(afterPng), diff: dataUri(px.diffPng) });
	return { id: key, styleDiff, pixels: { changed: px.changed, total: px.total } };
}

function main() {
	const { before, after, notes } = readArgs(process.argv.slice(2));
	const images = new Map();
	const states = pairStates(listCapture(before), listCapture(after)).map(({ key, inBefore, inAfter }) => {
		if (inBefore && inAfter) return comparedState(key, before, after, images);
		return lonelyState(key, inBefore ? before : after, inBefore, images);
	});
	const noteMap = notes ? JSON.parse(readFileSync(notes, "utf8")) : {};
	const report = buildReport(mergeNotes(states, noteMap));
	const outDir = join(root, `report-${before}-${after}`);
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, "report.html"), renderReportHtml(report, (id) => images.get(id)));
	console.log(`${report.changed.length} changed, ${report.unchangedCount} unchanged`);
	for (const s of report.changed) console.log(`  ${s.id}`);
	console.log(`report: ${join(outDir, "report.html")}`);
	process.exit(report.changed.length > 0 ? 1 : 0);
}

main();
