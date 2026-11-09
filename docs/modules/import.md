---
type: Module
title: Import
description: The WatchLog schema-1 converter and widget-fence rewriter kept for a future import, and what Hoard does today when it meets WatchLog data.
source:
  - src/import/watchlog/detect.ts
  - src/import/watchlog/schema1.ts
  - src/import/watchlog/schema1Types.ts
  - src/import/watchlog/schema1Notes.ts
  - src/import/watchlog/widgets.ts
  - src/storage/LocalStore.ts
  - src/backup.ts
  - src/main.ts
source_commit: 3cf70e7d99442c30c753b169d4da73e2ad38a964
---

# Import

`src/import/watchlog/` holds converters for data of WatchLog and WatchLog Sync, the plugins Hoard
originates from. **Nothing in the plugin calls them yet**: there is no startup migration and no
restore of WatchLog backups. Only `backup.ts` imports a type (`ImportContext`); the folder's tests
exercise the code. Only this folder may know WatchLog names (plugin ids, `WatchLog.base`, the
`watchlog:` key, `wl-*` fences, schema-1 data; `.claude/skills/project/SKILL.md`);
`test/i18nBoundary.test.ts` keeps it free of `i18n`.

## What exists

- [detect.ts](../../src/import/watchlog/detect.ts): `WATCHLOG_PLUGIN_IDS`, `findWatchLogBase` (first
  path-sorted `.base` named `WatchLog.base` or with a top-level `watchlog:` block),
  `findWatchLogPluginData` (first non-empty `data.json` of `watchlog-sync`, then `watchlog`).
- [schema1.ts](../../src/import/watchlog/schema1.ts): `importWatchLogData(data, ctx)` converts
  schema-1 data into notes through the normal codecs (`encodeTitle`, `encodeBook`, `encodeManga`,
  `encodeGame`, `splitCache`), so results match notes the plugin writes. Notes are created or only
  filled, never overwritten (`NoteWriter` in `schema1Notes.ts`) — except a title field that still
  equals the value an API delivered (stale API data), which is replaced unless the note sets it as an
  override; groups, airtime and history are
  applied, the base is filled when empty, the cache merged, missing device-local settings filled.
  No folder moves, `schemaVersion` untouched. Returns a `Schema1Report` (created, filled, skipped,
  errors). `mergeSideFiles` folds in old `reading.json`/`history.json`. Helpers:
  `schema1Normalize`, `schema1Records`, `schema1Types`.
- [widgets.ts](../../src/import/watchlog/widgets.ts): `rewriteWidgetFences` / `migrateWidgetFences`
  rename `watchlog` and `wl-*` code-block languages to the `hoard*` names (see
  [widgets](widgets.md)).

## Behaviour today

- **Hoard's own `data.json` is a WatchLog schema-1 file** (no `schemaVersion`, has `titles`):
  `LocalStore.load` starts with empty data and stays read-only for the whole session, so the file
  is never overwritten. `LoadResult` is `{ schema: 2 }`, `{ schema: 'newer' }` or `{ schema: 'watchlog' }`;
  `main.ts` shows a sticky Notice for the last two, since device settings typed in that session are
  lost ([storage](../architecture/storage.md)).
- **Backup restore**: `parseBackup` accepts only `version: 2` Hoard files; anything else is
  `unsupportedFormat` ([backup](backup.md)).
- `main.ts` does no WatchLog detection, adoption or warning at startup ([flows/startup](../flows/startup.md)).

## Where to change what

- WatchLog field mapping: `schema1Normalize.ts`. A new source: its own folder under `src/import/`
  with detect, convert and report; reuse the codecs and `NoteWriter`.
