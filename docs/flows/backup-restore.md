---
type: Flow
title: Backup and restore
description: What a backup file contains, which copy loses the API keys, and in which order a restore writes.
source:
  - src/modules/backup/services/backup.ts
  - src/modules/settings/ui/SettingsTab.ts
  - src/app/main.ts
  - src/shared/storage/entryReaders.ts
  - src/shared/storage/featureSettings.ts
  - src/modules/backup/contract.ts
  - src/app/wiring/settings.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Backup and restore

Trigger: the Backup section of the settings tab ([SettingsTab.ts](../../src/modules/settings/ui/SettingsTab.ts),
the `SettingsTabBackup` hooks `build` / `withoutSecrets` / `parse` / `restore`, bound to the backup functions in
[wiring/settings.ts](../../src/app/wiring/settings.ts)). Logic lives in [backup.ts](../../src/modules/backup/services/backup.ts), the
file shape `BackupFile` in [backup/contract.ts](../../src/modules/backup/contract.ts); `backupManagers()` in
[main.ts](../../src/app/main.ts) hands it every manager plus the stores. Entries are read back with
[entryReaders.ts](../../src/shared/storage/entryReaders.ts), the reading and games settings blocks with
[featureSettings.ts](../../src/shared/storage/featureSettings.ts).

## Export

1. `buildBackup` snapshots: titles, Maybe titles, reading (`exportSnapshot`), games
   (`exportSnapshot`), the shared settings of the base, the device-local settings and all history
   entries. Format `version: 2`. Keys live in [secret storage](../concepts/shared-vs-local.md), so
   `buildBackup` leaves the nine secret settings out (also any not yet moved from `data.json`): no
   backup carries keys, the download included.
2. Two destinations: a download writes the file as built; the copy written **into the vault** (mobile,
   `<root>/backups/`, via the Vault API) additionally goes through `withoutSecrets`, a guard that drops
   any local key matching `api key / secret / client id / steam id / token` and strips the login
   from the Jikan endpoint URL.

## Restore

1. `parseBackup` validates the file's shape (sections present, lists are arrays; entries
   themselves are read field by field: an entry without a text `id` and `title` is dropped, any other
   wrong field takes its empty value) before anything is written. Order: invalid JSON is `parseJson`, a
   non-object `notObject`, anything else that is not a version-2 Hoard file (WatchLog exports
   included) `unsupportedFormat` (WatchLog data
   comes in through the [import wizard](watchlog-import.md)). A rejected file
   yields an error code, shown by the settings tab as translated text ([i18n](../architecture/i18n.md)).
2. `restoreBackup` writes in this order: shared settings into the base (`restoreSharedSettings`),
   local settings into `data.json` (shared keys and prototype-polluting keys skipped, so the
   local section can never push a key into the base; a known setting of the wrong type is replaced by its
   valid form (`normalizeSettings`); keys of an old backup are moved by `LocalStore`
   into secret storage, fill-only, never kept in `data.json`), titles and Maybe titles that do not exist yet
   (`addTitleSilent` / `addMaybeTitle`, one notify), then reading, games and history through their
   managers' `restore`.
3. Existing notes are kept; a restore adds, it does not overwrite.

The same Backup section also hosts the WatchLog import entry (`addWatchLogImportRows`: import, and cleanup once a source is recorded as imported); that flow is [watchlog-import](watchlog-import.md).

Related: [shared vs local](../concepts/shared-vs-local.md), [modules/backup](../modules/backup.md).
