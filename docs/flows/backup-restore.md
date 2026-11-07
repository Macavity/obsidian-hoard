---
type: Flow
title: Backup and restore
description: What a backup file contains, which copy loses the API keys, and in which order a restore writes.
source:
  - src/backup.ts
  - src/SettingsTab.ts
  - src/migration/watchlog/backupImport.ts
  - src/main.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Backup and restore

Trigger: the Backup section of the settings tab ([SettingsTab.ts](../../src/SettingsTab.ts),
around `buildBackup` / `parseBackup` call sites). Logic lives in [backup.ts](../../src/backup.ts);
`plugin.backupManagers()` hands it every manager plus the stores.

## Export

1. `buildBackup` snapshots: titles, Maybe titles, reading (`exportSnapshot`), games
   (`exportSnapshot`), the shared settings of the base, the device-local settings including API
   keys, and all history entries. Format `version: 2`.
2. Two destinations: a download keeps everything; the copy written **into the vault** goes through
   `withoutSecrets`, which drops every local key matching `api key / secret / client id / steam id /
   token` and strips the login from the Jikan endpoint URL.

## Restore

1. `parseBackup` validates the file's shape (sections present, lists are arrays; entries
   themselves are not checked) before anything is written; anything that is not a
   version-2 Hoard file is handed to `parseWatchLogBackup` (WatchLog exports v1 to v3), which the
   [import module](../modules/import.md) restores through the schema-1 importer.
2. `restoreBackup` writes in this order: shared settings into the base (`restoreSharedSettings`),
   local settings into `data.json` (shared keys and prototype-polluting keys skipped, so the
   local section can never push a key into the base), titles and Maybe titles that do not exist yet
   (`addTitleSilent` / `addMaybeTitle`, one notify), then reading, games and history through their
   managers' `restore`.
3. Existing notes are kept; a restore adds, it does not overwrite.

Related: [shared vs local](../concepts/shared-vs-local.md), [modules/backup](../modules/backup.md).
