import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
import { PNG } from "pngjs";
import { diffDumps, diffPixels, buildReport, renderReportHtml, compactDump, expandDump, pairStates, mergeNotes } from "./visual/compare.mjs";
import { STATES } from "./visual/states.mjs";

const el = (path: string, style: Record<string, string>, text = "") => ({ path, text, style });

const png = (w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Buffer => {
	const img = new PNG({ width: w, height: h });
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const [r, g, b] = paint(x, y);
			img.data[i] = r;
			img.data[i + 1] = g;
			img.data[i + 2] = b;
			img.data[i + 3] = 255;
		}
	}
	return PNG.sync.write(img);
};

describe("visual compare", () => {
	it("reports nothing for identical dumps", () => {
		const d = [el("div[0]", { color: "red" })];
		expect(diffDumps(d, structuredClone(d))).toEqual([]);
	});

	it("reports a changed property with both values", () => {
		const out = diffDumps([el("div[0]", { color: "red", width: "1px" })], [el("div[0]", { color: "blue", width: "1px" })]);
		expect(out).toEqual([{ path: "div[0]", kind: "style", props: [{ name: "color", before: "red", after: "blue" }] }]);
	});

	it("treats a missing property as empty string", () => {
		const out = diffDumps([el("div[0]", {})], [el("div[0]", { color: "red" })]);
		expect(out[0]?.props).toEqual([{ name: "color", before: "", after: "red" }]);
	});

	it("reports added, removed and text changes", () => {
		const out = diffDumps([el("div[0]", {}, "a"), el("div[0]/b[0]", {})], [el("div[0]", {}, "b"), el("div[0]/i[0]", {})]);
		expect(out.map((o) => `${o.kind}:${o.path}`).sort()).toEqual(["added:div[0]/i[0]", "removed:div[0]/b[0]", "text:div[0]"]);
	});

	it("yields text and style for one element", () => {
		const out = diffDumps([el("a[0]", { color: "red" }, "x")], [el("a[0]", { color: "blue" }, "y")]);
		expect(out.map((o) => o.kind).sort()).toEqual(["style", "text"]);
	});

	it("counts changed pixels", () => {
		const a = png(2, 2, () => [0, 0, 0]);
		const b = png(2, 2, (x, y) => (x === 1 && y === 1 ? [255, 255, 255] : [0, 0, 0]));
		const r = diffPixels(a, b);
		expect(r.changed).toBe(1);
		expect(r.total).toBe(4);
		expect(PNG.sync.read(r.diffPng).width).toBe(2);
	});

	it("treats a size mismatch as fully changed", () => {
		const a = png(2, 2, () => [0, 0, 0]);
		const b = png(3, 2, () => [0, 0, 0]);
		const r = diffPixels(a, b);
		expect(r.total).toBe(6);
		expect(r.changed).toBe(r.total);
		expect(PNG.sync.read(r.diffPng).width).toBe(3);
	});

	it("sorts changed states by pixel count and counts the rest", () => {
		const s = (id: string, changed: number, styleDiff: unknown[] = []) => ({ id, styleDiff, pixels: { changed, total: 100 } });
		const r = buildReport([s("a", 0), s("b", 5), s("c", 9), s("d", 0, [{ path: "x", kind: "text" }])] as never);
		expect(r.changed.map((x) => x.id)).toEqual(["c", "b", "d"]);
		expect(r.unchangedCount).toBe(1);
	});

	it("renders only changed states, each with a slider", () => {
		const r = buildReport([{ id: "tab-list", styleDiff: [], pixels: { changed: 3, total: 9 } }, { id: "tab-log", styleDiff: [], pixels: { changed: 0, total: 9 } }] as never);
		const html = renderReportHtml(r, () => ({ before: "data:,", after: "data:,", diff: "data:," }));
		expect(html).toContain("tab-list");
		expect(html).not.toContain("tab-log");
		expect(html.match(/type="range"/g)).toHaveLength(1);
	});

	it("escapes hostile text and caps the property list", () => {
		const props = Array.from({ length: 45 }, (_, i) => ({ name: `p${i}`, before: "a", after: "b" }));
		const r = buildReport([
			{
				id: "<script>x</script>",
				styleDiff: [{ path: "div[0]", kind: "style", props }],
				pixels: { changed: 1, total: 4 },
				note: { verdict: "expected", reason: "<script>alert(1)</script>" },
			},
		] as never);
		const html = renderReportHtml(r, () => ({ before: "data:,", after: "data:,", diff: "data:," }));
		expect(html).not.toContain("<script>x</script>");
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("+5 more");
		expect(html).not.toContain("p44");
	});
});

describe("visual catalogue", () => {
	it("has unique kebab ids", () => {
		const ids = STATES.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});

	it("roots survive the class rename", () => {
		for (const s of STATES) expect(s.root.replace(/hoard-view/g, "")).not.toContain("hoard-");
	});

	it("covers the agreed surface", () => {
		expect(STATES.length).toBeGreaterThanOrEqual(55);
	});

	it("marks phone states", () => {
		expect(STATES.filter((s) => s.phone).length).toBeGreaterThanOrEqual(13);
	});
});

describe("visual dump storage", () => {
	const dump = [
		el("div[0]", { color: "red", width: "100px", "font-size": "14px" }, "root"),
		el("div[0]/span[0]", { color: "red", width: "20px", "font-size": "14px" }, "a"),
		el("div[0]/span[0]::before", { color: "blue", width: "20px", "font-size": "14px" }, '"x"'),
		el("div[0]/span[1]", { color: "green", width: "20px", "font-size": "14px", extra: "1" }),
	];

	it("round-trips through the compact form", () => {
		const stored = JSON.parse(JSON.stringify(compactDump(dump))) as ReturnType<typeof compactDump>;
		expect(expandDump(stored)).toEqual(dump);
	});

	it("keeps only what differs from the parent", () => {
		const compact = compactDump(dump);
		expect(compact.els[1]?.d.length).toBe(2); // width only
	});
});

describe("visual pairing and notes", () => {
	it("pairs states of both sides and flags the lonely ones", () => {
		expect(pairStates(["a/x", "a/y"], ["a/y", "a/z"])).toEqual([
			{ key: "a/x", inBefore: true, inAfter: false },
			{ key: "a/y", inBefore: true, inAfter: true },
			{ key: "a/z", inBefore: false, inAfter: true },
		]);
	});

	it("merges notes by id and ignores unknown ids", () => {
		const states = [
			{ id: "a/x", styleDiff: [], pixels: { changed: 1, total: 2 } },
			{ id: "a/y", styleDiff: [], pixels: { changed: 0, total: 2 } },
		];
		const out = mergeNotes(states, { "a/x": { verdict: "expected", reason: "renamed" }, "a/q": { verdict: "open", reason: "?" } });
		expect(out[0]?.note).toEqual({ verdict: "expected", reason: "renamed" });
		expect(out[1]?.note).toBeUndefined();
	});
});
