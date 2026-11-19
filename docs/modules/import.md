---
type: Module
title: Migration
description: How notes from WatchLog and other trackers enter Hoard — only via the migrate-notes agent skill, not an in-plugin wizard.
source:
  - .claude/skills/migrate-notes/SKILL.md
  - .claude/skills/migrate-notes/references/watchlog.md
  - .claude/skills/migrate-notes/references/library.md
source_commit: 0bc1a4e
---

# Migration

There is **no in-app bulk import**. Notes from WatchLog, Library, or another tracker are moved into
Hoard by the agent skill [`.claude/skills/migrate-notes/`](../../.claude/skills/migrate-notes/SKILL.md).
The former WatchLog wizard and `src/modules/import/` pipeline are gone.

## What the skill does

1. Detects the source (WatchLog schema-1 `data.json`, WatchLog Sync / fork notes, Library notes, or
   an ad-hoc map).
2. Maps properties onto Hoard's Title Case names ([properties](../concepts/properties.md)).
3. Writes notes under the Hoard root (`Movie/`, `TV Show/`, `Books/`, …); existing Hoard values win.
4. Optionally cleans up identical old copies and renames `watchlog` / `wl-*` widget fences.

References: [watchlog.md](../../.claude/skills/migrate-notes/references/watchlog.md),
[library.md](../../.claude/skills/migrate-notes/references/library.md). Samples under
`.claude/skills/migrate-notes/samples/`; converted fixtures in `hoard-test-vault/` prove codecs accept them.

## How a user runs it

Not a button in Obsidian. Open the vault with an AI coding agent that can load the skill from this
repo (or a copy of the skill folder), then ask it to migrate. Details for store visitors belong in
README / `guide/` ([#19](https://github.com/Macavity/obsidian-hoard/issues/19)).

## What stays in the plugin

- [LocalStore](../../src/shared/storage/LocalStore.ts) still refuses a Hoard `data.json` that is
  WatchLog schema-1 shaped, so it never overwrites that file.
- Backup restore still rejects WatchLog backup formats ([backup](backup.md)).
- CSV import/export for watchlist and reading remains (settings), unrelated to tracker migration.

## Where to change what

- Mapping rules or a new worked example: edit the skill references and samples; add a fixture under
  `hoard-test-vault/` and bump `test/e2e/expected.mjs` when the note must decode.
- Do not reintroduce an import wizard under `src/modules/`.
