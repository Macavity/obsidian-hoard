import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { changedProps, bodyWithout, findNoteByExternalId, readNote } from "./e2e/note.mjs";

describe("note diff helpers", () => {
  it("reports added, removed and changed properties only", () => {
    expect(changedProps({ a: 1, b: "x", c: [1] }, { a: 1, b: "y", d: true }).sort()).toEqual(["b", "c", "d"]);
  });
  it("treats equal arrays as unchanged", () => {
    expect(changedProps({ s: ["S1: 9"] }, { s: ["S1: 9"] })).toEqual([]);
  });
  it("removes only the named section", () => {
    const body = "# T\n\n## Notes\nold\n\n## Mine\nkeep\n";
    expect(bodyWithout(body, "Notes")).toBe("# T\n\n## Mine\nkeep\n");
  });
  it("removes a trailing section", () => {
    expect(bodyWithout("# T\n\n## Notes\nold\n", "Notes")).toBe("# T\n");
  });
  it("reads properties and body", () => {
    const dir = mkdtempSync(join(tmpdir(), "note-"));
    mkdirSync(join(dir, "A"));
    writeFileSync(join(dir, "A", "n.md"), "---\ntitle: X\nseasons:\n  - 'S1: 9'\n---\n# X\n\n## Notes\nhi\n");
    const n = readNote(dir, "A/n.md");
    expect(n.props).toEqual({ title: "X", seasons: ["S1: 9"] });
    expect(n.body).toBe("# X\n\n## Notes\nhi\n");
  });
  it("finds a note by External ID, skipping broken and foreign ones", () => {
    const dir = mkdtempSync(join(tmpdir(), "note-"));
    mkdirSync(join(dir, "M"));
    writeFileSync(join(dir, "M", "broken.md"), "---\nName: [unclosed\nStatus: : : x\n---\n");
    writeFileSync(join(dir, "M", "other.md"), "---\nExternal ID: imdb:tt1\n---\n");
    writeFileSync(join(dir, "M", "hit.md"), "---\nExternal ID: openlibrary:OL5W\n---\n");
    writeFileSync(join(dir, "M", "skip.txt"), "x");
    expect(findNoteByExternalId(dir, "M", "imdb:tt1")?.path).toBe("M/other.md");
    expect(findNoteByExternalId(dir, "M", /^openlibrary:OL\d+W$/)?.path).toBe("M/hit.md");
    expect(findNoteByExternalId(dir, "M", "imdb:tt2")).toBeNull();
    expect(findNoteByExternalId(dir, "Missing", "imdb:tt1")).toBeNull();
  });
});
