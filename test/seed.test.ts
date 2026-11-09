import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEED_PATH, pluginDataDir, writeSeed } from "../scripts/lib/seed.mjs";
import { pendingSources } from "../src/import/watchlog/onboardingState";
import { LocalStore } from "../src/storage/LocalStore";

const seed = JSON.parse(readFileSync(SEED_PATH, "utf8")) as unknown;

async function loadLocalStoreFrom(data: unknown): Promise<LocalStore> {
  const local = new LocalStore({ loadData: () => Promise.resolve(data), saveData: () => Promise.resolve() });
  await local.load();
  return local;
}

describe("test vault seed", () => {
  it("is a current LocalData file that LocalStore accepts writable", async () => {
    const local = await loadLocalStoreFrom(seed);
    expect(local.isWritable).toBe(true);
    expect(local.data.schemaVersion).toBe(2);
  });
  it("marks both WatchLog sources as decided", async () => {
    const local = await loadLocalStoreFrom(seed);
    const sources = { original: {} as never, fork: {} as never, hoardHasData: true };
    expect(pendingSources(local, sources)).toEqual([]);
  });
  it("writeSeed creates dist/ and overwrites data.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-"));
    const dist = join(dir, "dist");
    writeSeed(dist);
    expect(JSON.parse(readFileSync(join(dist, "data.json"), "utf8"))).toEqual(seed);
    writeFileSync(join(dist, "data.json"), '{"stale":true}');
    writeSeed(dist);
    expect(JSON.parse(readFileSync(join(dist, "data.json"), "utf8"))).toEqual(seed);
  });
});

describe("pluginDataDir", () => {
  it("follows the vault's plugin link into another checkout's dist", () => {
    const root = mkdtempSync(join(tmpdir(), "seed-link-"));
    const otherDist = join(root, "other", "dist");
    mkdirSync(otherDist, { recursive: true });
    const plugins = join(root, "vault", ".obsidian", "plugins");
    mkdirSync(plugins, { recursive: true });
    symlinkSync(otherDist, join(plugins, "hoard"));
    expect(pluginDataDir(join(root, "vault"), "/fallback")).toBe(realpathSync(otherDist));
  });
  it("falls back when the vault has no plugin folder", () => {
    const root = mkdtempSync(join(tmpdir(), "seed-nolink-"));
    expect(pluginDataDir(root, "/fallback")).toBe("/fallback");
  });
});
