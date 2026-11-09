import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SEED_PATH, writeSeed } from "../scripts/lib/seed.mjs";
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
