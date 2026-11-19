---
type: Module
title: Import
description: The import module boundary: what src/modules/import/ owns, the schema-1 converter and shared contracts, and where a new source goes.
source:
  - src/modules/import/domain/importReport.ts
  - src/modules/import/services/watchlog/detect.ts
  - src/modules/import/services/watchlog/importer.ts
  - src/modules/import/services/watchlog/paths.ts
  - src/modules/import/services/watchlog/propertyNames.ts
  - src/modules/import/services/watchlog/importFork.ts
  - src/modules/import/services/watchlog/schema1.ts
  - src/modules/import/services/watchlog/schema1Types.ts
  - src/modules/import/services/watchlog/schema1Notes.ts
  - src/modules/import/services/watchlog/widgets.ts
  - src/modules/import/ui/WatchLogOnboardingModal.ts
  - src/modules/import/ui/WatchLogReport.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Import

External data enters Hoard only through a **user-driven copy**: a wizard offers it, the source stays
untouched, existing Hoard values win. The one source today is WatchLog / WatchLog Sync, the plugins
Hoard originates from, in `src/modules/import/services/watchlog/`. The sequence, decisions and cleanup are in
[flows/watchlog-import](../flows/watchlog-import.md); user-facing text in README "Importing from
WatchLog". Backups of other plugins are not restored (`parseBackup` rejects them as
`unsupportedFormat`, see [backup](backup.md)).

## What exists

Only this module, [WatchLogOnboardingModal.ts](../../src/modules/import/ui/WatchLogOnboardingModal.ts) and their tests
may know WatchLog: plugin ids, `WatchLog.base`, the `watchlog:` key, `wl-*` widget names, schema-1
data (`.claude/skills/project/SKILL.md`). The folder stays free of translated text: the wizard owns all
copy (`onboarding.*`, [i18n](../architecture/i18n.md)), and the import logic only returns reports.
There is no `contract.ts`: the module exposes no roles, and nothing imports it except `app/main.ts`
(detection, `createImporter`, `importContext()` which builds the `ImportContext` it writes into, decisions); the
settings tab reaches the wizard only through the host callbacks `openWatchLogImport` and `watchLogImported`.
The import itself imports the other modules' contracts type-only (`HoardTitle`, `ReadingData`, `GamesData`, …).

## Contracts

- **Types** ([registerTypes.ts](../../src/modules/import/services/watchlog/registerTypes.ts)): both imports append the
  source's Watchlist types that Hoard's base lacks, by name, without touching Hoard's own.

- **Report** ([importReport.ts](../../src/modules/import/domain/importReport.ts), the module's `domain/`): `created`, `filled`, `review`
  (`path`, reason `exists` / `kept-value` / `error`, optional `code` + `params` that the UI translates
  in [WatchLogReport.ts](../../src/modules/import/ui/WatchLogReport.ts)), `errors`, plus a `Progress` callback (`notes`,
  `history`, `base`, `settings`). A run with any `errors` counts as failed; a per-file error is also a
  review item, `generalErrors` returns the rest. The report note is rendered on the UI side and only
  written by the services (`writeReportNote` in `reportNote.ts`).
- **Importer** ([importer.ts](../../src/modules/import/services/watchlog/importer.ts)): `createImporter` is the
  seam between wizard and logic (`run`, `plan`, `cleanup`, `writeReport`, `decide`); the modal
  depends only on that interface, so it is tested with a fake.
- **Managed files** ([paths.ts](../../src/modules/import/services/watchlog/paths.ts)): `managedFiles` = every file in a
  layout's type, book, manga, game and list folders plus its history file, minus Hoard's own root
  (Hoard at the vault root `''` excludes nothing). `forkTarget` maps a fork path below Hoard's root.
  Fork import and cleanup both use them; `entryFolders` is the subset of entry folders (types, Books, Manga, Games; no custom lists).

## Property translation

Fork notes carry Hoard 0.1 property names. [propertyNames.ts](../../src/modules/import/services/watchlog/propertyNames.ts)
holds `OLD_TO_NEW` and `translateProperties(fm) → { fm, kept }`: renames known old keys by content,
converts `progress` text to a number and manga `malId` to a number, folds `apiSource` + `apiId`,
`manualPosterUrl`, `manualTrailerUrl`. Idempotent: when the new key exists the old one stays and is
returned in `kept` (a `kept-value` review item). `importFork` applies it to copied entry notes only
(`entryFolders`, not custom lists or history) and writes only when something changes, so a note
without old keys stays byte-identical; broken YAML becomes an `invalidYaml` review item and the copy
stays. Lookups are own-property only (`newName`), so keys like `constructor` or `__proto__` pass through
unchanged. Names and rules: [properties](../concepts/properties.md).

## Schema-1 converter

`importWatchLogData` ([schema1.ts](../../src/modules/import/services/watchlog/schema1.ts)) turns a WatchLog schema-1
`data.json` into notes with the normal codecs (`titleToProperties`, `encodeBook`, `encodeManga`,
`encodeGame`, `titleToCache`), so converted notes look like ones the plugin wrote. Order: normalize,
titles, Maybe titles (as `maybe: true`; one already in the library is reported), books, manga, games,
history, base (last), cache merge, then device-local settings filled only where empty. Secrets never
go into vault files (shared keys are whitelisted by the base store). `NoteWriter`
([schema1Notes.ts](../../src/modules/import/services/watchlog/schema1Notes.ts)) creates a note or adds only missing
keys (a title field still equal to a stale API value is replaced unless the note sets it as an
override); a differing existing value becomes a `kept-value` review item. Duplicate title/type pairs in one run
get " 2", " 3", compared case-insensitively (macOS and Windows treat "Heat" and "heat" as one file). A
note that fails to write is reported and skipped. The fork's device settings skip shared and removed
keys like the schema-1 path does. WatchLog's custom reading columns are sanitized once in the normalize
step (blank or non-string names become `Field N`, case-insensitive duplicates get " 2", " 3"), so every
value gets its own `Custom <name>` key; a value whose column no longer exists becomes an `orphanValue`
review item. `prepareData` ([schema1Read.ts](../../src/modules/import/services/watchlog/schema1Read.ts)) reads the file as
`unknown`, field by field: a wrong-typed field is dropped, and an entry without id and title is skipped
and reported (`skipped`, one failed item each) without blocking the rest. Helpers: `schema1Normalize`
(WatchLog field quirks), `schema1Records` (groups,
airtime, history), `originalPaths` (where WatchLog kept its notes, from its settings).

Widget fence renaming ([widgets.ts](../../src/modules/import/services/watchlog/widgets.ts)) is a cleanup step; see
[widgets](widgets.md).

## Where to change what

- A new source: new folder under `src/modules/import/services/` with detect / import / report in the same contracts, a
  wizard (or a step in this one), wiring in `main.ts`; reuse the codecs and `NoteWriter`.
- WatchLog field mapping: `schema1Normalize.ts`. What cleanup may trash: `cleanup.ts`.
