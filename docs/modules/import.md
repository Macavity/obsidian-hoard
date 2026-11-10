---
type: Module
title: Import
description: The import module boundary: what src/import/watchlog owns, the schema-1 converter and shared contracts, and where a new source goes.
source:
  - src/import/watchlog/detect.ts
  - src/import/watchlog/importer.ts
  - src/import/watchlog/report.ts
  - src/import/watchlog/paths.ts
  - src/import/watchlog/propertyNames.ts
  - src/import/watchlog/importFork.ts
  - src/import/watchlog/schema1.ts
  - src/import/watchlog/schema1Notes.ts
  - src/import/watchlog/schema1Types.ts
  - src/import/watchlog/widgets.ts
  - src/WatchLogOnboardingModal.ts
  - src/WatchLogReport.ts
source_commit: adb460eda328223f7b19ac7eeb0f1d3bc18a1fd4
---

# Import

External data enters Hoard only through a **user-driven copy**: a wizard offers it, the source stays
untouched, existing Hoard values win. The one source today is WatchLog / WatchLog Sync, the plugins
Hoard originates from, in `src/import/watchlog/`. The sequence, decisions and cleanup are in
[flows/watchlog-import](../flows/watchlog-import.md); user-facing text in README "Importing from
WatchLog". Backups of other plugins are not restored (`parseBackup` rejects them as
`unsupportedFormat`, see [backup](backup.md)).

## What exists

Only this folder, [WatchLogOnboardingModal.ts](../../src/WatchLogOnboardingModal.ts) and their tests
may know WatchLog: plugin ids, `WatchLog.base`, the `watchlog:` key, `wl-*` widget names, schema-1
data (`.claude/skills/project/SKILL.md`). The folder stays free of translated text: the wizard owns all
copy (`onboarding.*`, [i18n](../architecture/i18n.md)), and the import logic only returns reports.
Other code touches it at three points: `main.ts` (detection, `createImporter`, decisions),
`SettingsTab.ts` (`getDecision`, entry buttons) and `backup.ts` (the `ImportContext` type that
`backupManagers().storage.importContext()` builds for the importer).

## Contracts

- **Types** ([registerTypes.ts](../../src/import/watchlog/registerTypes.ts)): both imports append the
  source's Watchlist types that Hoard's base lacks, by name, without touching Hoard's own.

- **Report** ([report.ts](../../src/import/watchlog/report.ts)): `created`, `filled`, `review`
  (`path`, reason `exists` / `kept-value` / `error`, optional `code` + `params` that the UI translates
  in [WatchLogReport.ts](../../src/WatchLogReport.ts)), `errors`, plus a `Progress` callback (`notes`,
  `history`, `base`, `settings`). A run with any `errors` counts as failed; a per-file error is also a
  review item, `generalErrors` returns the rest. The report note is rendered on the UI side and only
  written here (`writeReportNote`).
- **Importer** ([importer.ts](../../src/import/watchlog/importer.ts)): `createImporter` is the
  seam between wizard and logic (`run`, `plan`, `cleanup`, `writeReport`, `decide`); the modal
  depends only on that interface, so it is tested with a fake.
- **Managed files** ([paths.ts](../../src/import/watchlog/paths.ts)): `managedFiles` = every file in a
  layout's type, book, manga, game and list folders plus its history file, minus Hoard's own root
  (Hoard at the vault root `''` excludes nothing). `forkTarget` maps a fork path below Hoard's root.
  Fork import and cleanup both use them; `entryFolders` is the subset of entry folders (types, Books, Manga, Games; no custom lists).

## Property translation

Fork notes carry Hoard 0.1 property names. [propertyNames.ts](../../src/import/watchlog/propertyNames.ts)
holds `OLD_TO_NEW` and `translateProperties(fm) → { fm, kept }`: renames known old keys by content,
converts `progress` text to a number and manga `malId` to a number, folds `apiSource` + `apiId`,
`manualPosterUrl`, `manualTrailerUrl`. Idempotent: when the new key exists the old one stays and is
returned in `kept` (a `kept-value` review item). `importFork` applies it to copied entry notes only
(`entryFolders`, not custom lists or history) and writes only when something changes, so a note
without old keys stays byte-identical; broken YAML becomes an `invalidYaml` review item and the copy
stays. Lookups are own-property only (`newName`), so keys like `constructor` or `__proto__` pass through
unchanged. Names and rules: [properties](../concepts/properties.md).

## Schema-1 converter

`importWatchLogData` ([schema1.ts](../../src/import/watchlog/schema1.ts)) turns a WatchLog schema-1
`data.json` into notes with the normal codecs (`encodeTitle`, `encodeBook`, `encodeManga`,
`encodeGame`, `splitCache`), so converted notes look like ones the plugin wrote. Order: normalize,
titles, Maybe titles (as `maybe: true`; one already in the library is reported), books, manga, games,
history, base (last), cache merge, then device-local settings filled only where empty. Secrets never
go into vault files (shared keys are whitelisted by the base store). `NoteWriter`
([schema1Notes.ts](../../src/import/watchlog/schema1Notes.ts)) creates a note or adds only missing
keys (a title field still equal to a stale API value is replaced unless the note sets it as an
override); a differing existing value becomes a `kept-value` review item. Duplicate title/type pairs in one run
get " 2", " 3", compared case-insensitively (macOS and Windows treat "Heat" and "heat" as one file). A
note that fails to write is reported and skipped. The fork's device settings skip shared and removed
keys like the schema-1 path does. Helpers: `schema1Normalize` (WatchLog field quirks), `schema1Records` (groups,
airtime, history), `originalPaths` (where WatchLog kept its notes, from its settings).

Widget fence renaming ([widgets.ts](../../src/import/watchlog/widgets.ts)) is a cleanup step; see
[widgets](widgets.md).

## Where to change what

- A new source: new folder under `src/import/` with detect / import / report in the same contracts, a
  wizard (or a step in this one), wiring in `main.ts`; reuse the codecs and `NoteWriter`.
- WatchLog field mapping: `schema1Normalize.ts`. What cleanup may trash: `cleanup.ts`.
