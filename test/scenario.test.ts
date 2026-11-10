import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const toggle = vi.hoisted(() => ({ fail: false }));
vi.mock("../scripts/lib/plugin-toggle.mjs", () => ({
  withPluginDisabled: (fn: () => unknown) => (toggle.fail ? Promise.reject(new Error("cli timed out")) : Promise.resolve(fn())),
}));
const { prepareScenario, scenarioDir, RestoreError, EMPTY_DATA } = await import("./e2e/scenario.mjs");
const { LocalStore } = await import("../src/storage/LocalStore");

function makeVault() {
  const root = mkdtempSync(join(tmpdir(), "scn-"));
  const vault = join(root, "hoard-test-vault");
  mkdirSync(join(vault, "Hoard"), { recursive: true });
  writeFileSync(join(vault, "Hoard", "Hoard.base"), "x");
  mkdirSync(join(vault, ".obsidian/plugins/watchlog"), { recursive: true });
  writeFileSync(join(vault, ".obsidian/plugins/watchlog/data.json"), '{"mine":true}');
  writeFileSync(join(vault, ".obsidian/workspace.json"), "ws");
  return { root, vault, dist: join(root, "dist") };
}

describe("scenarioDir", () => {
  it("throws for unknown names", () => {
    expect(() => scenarioDir("nope")).toThrow(/unknown scenario/);
    expect(() => scenarioDir("../x")).toThrow(/unknown scenario/);
  });
});

describe("prepareScenario", () => {
  it("installs the scenario and restores the user's WatchLog data afterwards", async () => {
    const { vault, dist } = makeVault();
    const resetVault = vi.fn(() => Promise.resolve());
    const { restore } = await prepareScenario("watchlog-original", { vault, distDir: dist, resetVault });
    expect(readFileSync(join(vault, ".obsidian/plugins/watchlog/data.json"), "utf8")).not.toBe('{"mine":true}');
    expect((JSON.parse(readFileSync(join(dist, "data.json"), "utf8")) as { ui: unknown }).ui).toEqual({});
    expect(existsSync(join(vault, "Hoard"))).toBe(false);
    expect(readFileSync(join(vault, ".obsidian/workspace.json"), "utf8")).toBe("ws");
    await restore();
    expect(readFileSync(join(vault, ".obsidian/plugins/watchlog/data.json"), "utf8")).toBe('{"mine":true}');
    expect(resetVault).toHaveBeenCalledOnce();
  });

  it("removes the scenario's WatchLog data on restore when the user had none", async () => {
    const { vault, dist } = makeVault();
    const { rmSync } = await import("node:fs");
    rmSync(join(vault, ".obsidian/plugins/watchlog"), { recursive: true });
    const { restore } = await prepareScenario("watchlog-original", { vault, distDir: dist, resetVault: () => Promise.resolve() });
    expect(existsSync(join(vault, ".obsidian/plugins/watchlog/data.json"))).toBe(true);
    await restore();
    expect(existsSync(join(vault, ".obsidian/plugins/watchlog"))).toBe(false);
  });

  it("keeps the backup and names it when restore fails", async () => {
    const { vault, dist } = makeVault();
    toggle.fail = false;
    const { restore } = await prepareScenario("watchlog-original", { vault, distDir: dist, resetVault: () => Promise.resolve() });
    toggle.fail = true;
    try {
      const err = await restore().then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(RestoreError);
      const backup = /(\S*hoard-scenario-\S*?)(?=[\s:,)]|$)/.exec((err as Error).message)?.[1] ?? "";
      expect(readFileSync(join(backup, "watchlog/data.json"), "utf8")).toBe('{"mine":true}');
      expect((err as Error).message).toMatch(/cli timed out/);
    } finally {
      toggle.fail = false;
    }
  });

  it("surfaces the original error when restore fails during prepare", async () => {
    const { vault, root } = makeVault();
    const distFile = join(root, "dist-is-a-file");
    writeFileSync(distFile, "x");
    const err = await prepareScenario("watchlog-original", { vault, distDir: distFile, resetVault: () => Promise.reject(new Error("reset down")) })
      .then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect((err as Error).message).toMatch(/EEXIST|ENOTDIR/);
    expect((err as Error).message).toMatch(/reset down/);
  });
});

describe("EMPTY_DATA", () => {
  it("matches what LocalStore starts with", async () => {
    const local = new LocalStore({ loadData: () => Promise.resolve(undefined), saveData: () => Promise.resolve() });
    await local.load();
    expect(local.data).toEqual(EMPTY_DATA);
  });
});
