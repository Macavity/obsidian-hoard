import { describe, it, expect } from "vitest";
import manifest from "../manifest.json";

describe("tooling", () => {
  it("manifest follows community rules", () => {
    expect(manifest.id).toBe("hoard");
    expect(manifest.id).not.toMatch(/obsidian/i);
    expect(manifest.name).not.toMatch(/obsidian/i);
    expect(manifest.isDesktopOnly).toBe(false);
  });
});
