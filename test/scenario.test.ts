import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../scripts/lib/plugin-toggle.mjs", () => ({ withPluginDisabled: (fn: () => unknown) => Promise.resolve(fn()) }));
const { prepareScenario, scenarioDir } = await import("../scripts/e2e/scenario.mjs");

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
});
