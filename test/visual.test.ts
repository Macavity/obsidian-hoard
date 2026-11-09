import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { comparePng, cropPng } from "../scripts/lib/visual.mjs";

function png(w: number, h: number, paint?: (x: number, y: number) => [number, number, number]) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = paint?.(x, y) ?? [255, 255, 255];
    const i = (y * w + x) * 4; p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = 255;
  }
  return PNG.sync.write(p);
}

describe("comparePng", () => {
  it("accepts identical images", () => expect(comparePng(png(100, 100), png(100, 100))).toMatchObject({ ok: true, diffRatio: 0 }));
  it("tolerates a single pixel", () =>
    expect(comparePng(png(100, 100, (x, y) => (x === 5 && y === 5 ? [0, 0, 0] : [255, 255, 255])), png(100, 100)).ok).toBe(true));
  it("rejects a changed block and returns a diff", () => {
    const r = comparePng(png(100, 100, (x, y) => (x < 20 && y < 20 ? [0, 0, 0] : [255, 255, 255])), png(100, 100));
    expect(r.ok).toBe(false);
    expect(r.diff).not.toBeNull();
  });
  it("rejects a size mismatch", () => expect(comparePng(png(10, 10), png(10, 11))).toMatchObject({ ok: false, reason: "size" }));
});

describe("cropPng", () => {
  it("crops in device pixels", () => {
    const src = png(40, 40, (x, y) => (x >= 20 && y >= 20 ? [0, 0, 0] : [255, 255, 255]));
    const out = PNG.sync.read(cropPng(src, { x: 10, y: 10, width: 10, height: 10 }, 2));
    expect([out.width, out.height]).toEqual([20, 20]);
    expect(out.data[0]).toBe(0);
  });
  it("clamps to the image bounds", () => {
    const out = PNG.sync.read(cropPng(png(10, 10), { x: 5, y: 5, width: 20, height: 20 }, 1));
    expect([out.width, out.height]).toEqual([5, 5]);
  });
});
