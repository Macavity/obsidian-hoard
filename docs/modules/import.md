---
type: Module
title: Migration
description: How notes from WatchLog and other trackers enter Hoard — only via guide/migrate-notes, not an in-plugin wizard.
source:
  - guide/migrate-notes/README.md
  - guide/migrate-notes/watchlog.md
  - guide/migrate-notes/library.md
source_commit: HEAD
---

# Migration

There is **no in-app bulk import**. Notes from WatchLog, Library, or another tracker are moved into
Hoard by following [guide/migrate-notes/](../../guide/migrate-notes/README.md) (yourself or any AI
agent pointed at that folder). The former WatchLog wizard and `src/modules/import/` pipeline are gone.

## What the guide covers

1. Detects the source (WatchLog schema-1 `data.json`, WatchLog Sync / fork notes, Library notes, or
   an ad-hoc map).
2. Maps properties onto Hoard's Title Case names ([properties](../concepts/properties.md)).
3. Writes notes under the Hoard root (`Movie/`, `TV Show/`, `Books/`, …); existing Hoard values win.
4. Optionally cleans up identical old copies and renames `watchlog` / `wl-*` widget fences.

References: [watchlog.md](../../guide/migrate-notes/watchlog.md),
[library.md](../../guide/migrate-notes/library.md). Samples under
`guide/migrate-notes/samples/`; converted fixtures in `hoard-test-vault/` prove codecs accept them.

## How a user runs it

Not a button in Obsidian. Open [guide/migrate-notes/](../../guide/migrate-notes/README.md) and follow
it, or point any AI coding agent at that folder and ask it to migrate. Store-facing wording for this
path belongs in README / the rest of `guide/` ([#19](https://github.com/Macavity/obsidian-hoard/issues/19)).

## What stays in the plugin

- [LocalStore](../../src/shared/storage/LocalStore.ts) still refuses a Hoard `data.json` that is
  WatchLog schema-1 shaped, so it never overwrites that file.
- Backup restore still rejects WatchLog backup formats ([backup](backup.md)).
- CSV import/export for watchlist and reading remains (settings), unrelated to tracker migration.

## Where to change what

- Mapping rules or a new worked example: edit the guide references and samples; add a fixture under
  `hoard-test-vault/` and bump `test/e2e/expected.mjs` when the note must decode.
- Do not reintroduce an import wizard under `src/modules/`.
