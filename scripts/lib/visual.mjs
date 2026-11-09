import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/** Crop a PNG to `rect` (CSS pixels × scale = device pixels), clamped to the image. */
export function cropPng(png, rect, scale) {
  const src = PNG.sync.read(png);
  const x = Math.min(src.width, Math.max(0, Math.round(rect.x * scale)));
  const y = Math.min(src.height, Math.max(0, Math.round(rect.y * scale)));
  const width = Math.min(src.width - x, Math.round(rect.width * scale));
  const height = Math.min(src.height - y, Math.round(rect.height * scale));
  const out = new PNG({ width, height });
  PNG.bitblt(src, out, x, y, width, height, 0, 0);
  return PNG.sync.write(out);
}

/** Compare two PNGs; `diff` holds the diff image when they differ too much. */
export function comparePng(actual, baseline, { threshold = 0.1, maxDiffRatio = 0.001 } = {}) {
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(baseline);
  if (a.width !== b.width || a.height !== b.height) {
    return { ok: false, diffRatio: 1, diff: null, reason: "size" };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  const diffRatio = diffPixels / (a.width * a.height);
  const ok = diffRatio <= maxDiffRatio;
  return { ok, diffRatio, diff: ok ? null : PNG.sync.write(diff) };
}
