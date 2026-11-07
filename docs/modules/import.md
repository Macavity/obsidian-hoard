---
type: Module
title: Import
description: Bringing data from other trackers into the vault. Today one source exists, WatchLog; the module boundary is built for more.
source:
  - src/migration/watchlog/index.ts
  - src/migration/watchlog/detect.ts
  - src/migration/watchlog/base.ts
  - src/migration/watchlog/pluginData.ts
  - src/migration/watchlog/schema1.ts
  - src/migration/watchlog/schema1Types.ts
  - src/migration/watchlog/widgets.ts
  - src/migration/watchlog/backupImport.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Import

External data enters Hoard in two ways: a one-time **migration** of a vault that another plugin
managed, and a **restore** of another plugin's backup file. Both exist today for WatchLog and
WatchLog Sync, the plugins Hoard originates from, under `src/migration/watchlog/`. Future sources
(a Trakt export, for example) belong beside it as their own folder with the same contract: detect,
convert into notes through the storage codecs, never overwrite existing values, report once.

## Boundary

Only this folder and its tests may know WatchLog: plugin ids, `WatchLog.base`, the `watchlog:` key,
`wl-*` widget names, schema-1 data (`.claude/skills/project/SKILL.md`). Everything else imports from
[index.ts](../../src/migration/watchlog/index.ts).

| Entry point | Called from | Does |
|---|---|---|
| `loadOwnOrWatchLog` | `LocalStore.load` in `main.ts` | adopts a WatchLog `data.json` while Hoard's is empty |
| `migrateFromWatchLog` | `startVaultStorage` | base rename, data adoption, schema-1 conversion, widget fences; one Notice |
| `watchLogRoot` | `startVaultStorage` | root folder for a pending schema-1 conversion |
| `WATCHLOG_PLUGIN_IDS` | `warnIfWatchLogEnabled` | warns while the old plugin is still enabled |
| `parseWatchLogBackup`, `restoreWatchLogBackup` | [backup](backup.md) | v1 to v3 export files → `importWatchLogData` |

## Schema-1 converter

`Schema1Migration` in [schema1.ts](../../src/migration/watchlog/schema1.ts) is the heart:
`run()` for the migration (writes `data.v1-backup.json`, may move folders, ends with a schema-2
`data.json`) and `importOnly()` for backup restores (no backup, no folder moves, schema untouched,
only missing device-local settings filled). It uses the normal codecs (`encodeTitle`, `encodeBook`,
`encodeManga`, `encodeGame`, `splitCache`) so converted notes are indistinguishable from ones the
plugin wrote. Helpers: `schema1Normalize` (WatchLog field quirks), `schema1Records` (groups,
airtime, history, local data), `schema1Notes` (`NoteWriter`: create or fill, never overwrite),
`schema1Folders`. `Schema1Report` counts created and filled notes, moved folders, skipped items and
errors; any error leaves `data.json` as schema 1 so the next start retries.

The step order and the second-device rule (`joined`) are in
[flows/watchlog-import](../flows/watchlog-import.md).

## Where to change what

- A new source: new folder under `src/migration/`, its own detect/convert/report, wired in
  `startVaultStorage` (migration) or `parseBackup` (restore); reuse the codecs and `NoteWriter`.
- WatchLog field mapping: `schema1Normalize.ts`; which keys a second device must not re-add:
  `JOINED_KEYS` in `schema1.ts`.
