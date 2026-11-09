import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyPluginData, isLocalState, syncVault } from "../scripts/lib/vault-sync.mjs";

function file(root: string, rel: string, content = rel) {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), content);
}

describe("isLocalState", () => {
  it("keeps plugins, themes, cache, workspace files and the trash", () => {
    for (const p of [".obsidian/plugins", ".obsidian/plugins/x/main.js", ".obsidian/themes", ".obsidian/themes/Minimal/theme.css", ".obsidian/cache", ".obsidian/workspace.json", ".obsidian/workspace-mobile.json", ".trash", ".trash/a.md"]) {
      expect(isLocalState(p), p).toBe(true);
    }
  });

  it("treats fixtures and the vault root as syncable", () => {
    for (const p of ["", ".obsidian", ".obsidian/app.json", ".obsidian/types.json", "Teams.base", "_perf/a.md", ".trashy.md"]) {
      expect(isLocalState(p), p).toBe(false);
    }
  });
});

describe("syncVault", () => {
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "ib-sync-"));
    const fixtures = join(root, "src", "hoard-test-vault");
    const vault = join(root, "dst", "hoard-test-vault");
    file(fixtures, "Teams.base", "new");
    file(fixtures, "Teams/Alpha.md");
    file(fixtures, ".obsidian/app.json");
    file(fixtures, ".obsidian/plugins/hoard/main.js");
    file(vault, "Teams.base", "old");
    file(vault, "_perf/x.md");
    file(vault, ".obsidian/stale.json");
    file(vault, ".obsidian/plugins/hoard/data.json");
    file(vault, ".obsidian/workspace.json");
    file(vault, ".trash/gone.md");
    return { root, fixtures, vault };
  }

  it("mirrors fixtures and drops leftovers but keeps local state", () => {
    const { fixtures, vault } = setup();
    syncVault(fixtures, vault);
    expect(readFileSync(join(vault, "Teams.base"), "utf8")).toBe("new");
    expect(existsSync(join(vault, "Teams/Alpha.md"))).toBe(true);
    expect(existsSync(join(vault, ".obsidian/app.json"))).toBe(true);
    expect(existsSync(join(vault, "_perf"))).toBe(false);
    expect(existsSync(join(vault, ".obsidian/stale.json"))).toBe(false);
    expect(existsSync(join(vault, ".obsidian/plugins/hoard/data.json"))).toBe(true);
    expect(existsSync(join(vault, ".obsidian/plugins/hoard/main.js"))).toBe(false);
    expect(existsSync(join(vault, ".obsidian/workspace.json"))).toBe(true);
    expect(existsSync(join(vault, ".trash/gone.md"))).toBe(true);
  });

  it("refuses directories that are not a hoard-test-vault", () => {
    const { root, fixtures } = setup();
    expect(() => syncVault(fixtures, join(root, "dst"))).toThrow(/not a hoard-test-vault/);
    expect(() => syncVault(fixtures, join(root, "missing", "hoard-test-vault"))).toThrow(/does not exist/);
  });

  it("accepts a differently named source only without requireSourceName", () => {
    const { root, vault } = setup();
    const src = join(root, "scenario", "vault");
    file(src, "A.md");
    expect(() => syncVault(src, vault)).toThrow(/not a hoard-test-vault/);
    syncVault(src, vault, { requireSourceName: false });
    expect(existsSync(join(vault, "A.md"))).toBe(true);
    expect(existsSync(join(vault, "Teams.base"))).toBe(false);
    expect(existsSync(join(vault, ".obsidian/plugins/hoard/data.json"))).toBe(true);
    expect(existsSync(join(vault, ".trash/gone.md"))).toBe(true);
    expect(() => syncVault(src, join(root, "dst"), { requireSourceName: false })).toThrow(/not a hoard-test-vault/);
  });
});

describe("copyPluginData", () => {
  it("replaces the plugin dir and is a no-op without a source", () => {
    const root = mkdtempSync(join(tmpdir(), "ib-cpd-"));
    const src = join(root, "s");
    const vault = join(root, "v");
    file(vault, ".obsidian/plugins/watchlog/old.json");
    copyPluginData(src, vault, "watchlog");
    expect(existsSync(join(vault, ".obsidian/plugins/watchlog/old.json"))).toBe(true);
    file(src, ".obsidian/plugins/watchlog/data.json", "new");
    copyPluginData(src, vault, "watchlog");
    expect(readFileSync(join(vault, ".obsidian/plugins/watchlog/data.json"), "utf8")).toBe("new");
    expect(existsSync(join(vault, ".obsidian/plugins/watchlog/old.json"))).toBe(false);
  });
});
