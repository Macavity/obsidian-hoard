# Migrate notes into Hoard

There is **no in-app bulk import**. This guide is the migration path. WatchLog's former wizard is gone; treat WatchLog like any other source.

Point any AI coding agent (or follow the steps yourself) at this folder. Existing Hoard values are never overwritten.

## When to use

- Moving WatchLog / WatchLog Sync / Library / Media DB / ad-hoc media notes into Hoard.
- Coming from another tracker.

## Preconditions

1. Confirm the Hoard root (folder that holds `Hoard.base`, usually `Hoard/`). Create `Hoard.base` with a `hoard:` block only if the vault has none — prefer adopting an existing root.
2. Authority for property names: [`src/shared/storage/properties.ts`](../../src/shared/storage/properties.ts) and [`docs/concepts/properties.md`](../../docs/concepts/properties.md). Never invent keys. Title Case with spaces; acronyms upper case (`URL`, `ID`, `MAL`).
3. One note = one entry. Place files under `<root>/<Type>/`, `Books/`, `Manga/`, or `Games/`. The path under the root is the entry id. Custom lists are not entries: one note per list under `<root>/CustomLists/` (see [docs/modules/custom-lists.md](../../docs/modules/custom-lists.md)).
4. Existing Hoard values win: when a note already exists, fill only missing properties; leave differing values alone. Never overwrite user data with source data.
5. Secrets (API keys, Steam id) stay on the device — never copy them into notes, `Hoard.base`, or backups.

## Procedure

1. **Identify the source**
   - WatchLog original: `.obsidian/plugins/watchlog/data.json` (schema-1, has `titles[]`). Optional siblings `reading.json` / `history.json`.
   - WatchLog Sync (fork): a `WatchLog.base` or a `.base` with a top-level `watchlog:` block; notes under that folder.
   - Library: notes with `Type` / `Name` / `My Rating` / `Progress: a/b` / `Source ID` style properties.
   - Other: inspect a few notes, then build a map onto Hoard names (same rules as below).
2. **Load the matching reference**
   - WatchLog → [watchlog.md](watchlog.md)
   - Library → [library.md](library.md)
   - Otherwise: map field-by-field using [docs/concepts/properties.md](../../docs/concepts/properties.md) and [docs/concepts/external-id.md](../../docs/concepts/external-id.md).
3. **Register types** — append any watchlist type names the source uses that Hoard's `hoard:` block lacks (by name only; keep existing colours).
4. **Write notes** under the Hoard root with current property names. Preserve useful body text under `## Notes` when the source had notes. Skip broken entries; report them.
5. **Optional cleanup** (ask first; nothing preselected): trash source notes that Hoard now holds as an identical copy; rename widget fences `watchlog` / `wl-*` → `hoard` / `hoard-*` (see WatchLog reference). Do not delete a source whose Hoard copy differs.
6. **Report** what was created, filled, skipped, and kept (conflicts).

## Samples

- [samples/library/](samples/library/) — Library-format notes (input).
- [samples/watchlog/](samples/watchlog/) — minimal WatchLog schema-1 slice and a fork-style note (input).

Converted outputs that the test vault accepts live under `hoard-test-vault/Hoard/` (fixtures omit `External ID` and use `Cover: none` when a real cover would hit the network).

## Non-goals

- Do not restore WatchLog plugin backups through Hoard's Backup UI (still rejected).
- Do not put entry data into `data.json`.
- Do not reintroduce an in-plugin import wizard.
