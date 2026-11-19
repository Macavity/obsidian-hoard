---
type: Module
title: Backup
description: The JSON backup format, the two export variants, validation and the restore contract.
source:
  - src/modules/backup/contract.ts
  - src/modules/backup/services/backup.ts
  - src/app/main.ts
  - src/app/wiring/settings.ts
  - src/shared/storage/entryReaders.ts
  - src/shared/storage/featureSettings.ts
  - src/shared/storage/SecretStore.ts
  - src/shared/domain/read.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Backup

One file, `version: 2` (`BackupFile` in [contract.ts](../../src/modules/backup/contract.ts), types only; logic in
[backup.ts](../../src/modules/backup/services/backup.ts)):

```
entries: { titles, maybe, reading: { books, manga, settings }, games: { games, settings } }
shared:  the hoard: block of the base
local:   device-local settings, never API keys (they live in secret storage)
history: all entries
```

- `buildBackup(managers)` reads through role interfaces only: `BackupManagers` is
  `Pick<TitleReader, …> & TitleBackup`, `ReadingSnapshot`, `GameSnapshot`, `HistoryManager` plus the
  `LocalStore` / `SharedConfigStore` ([watchlist](watchlist.md), [reading](reading.md),
  [games](games.md) contracts; imported type-only). `backupManagers()` in
  [main.ts](../../src/app/main.ts) assembles them and hands them to the settings wiring
  ([wiring/settings.ts](../../src/app/wiring/settings.ts)), which passes `build` / `parse` / `restore` /
  `withoutSecrets` to the settings tab. The [import wizard](import.md) has its own `importContext()`; backup
  restore does not use it.
- `buildBackup` drops the nine `SECRET_KEYS` from `local` (`withoutSecretSettings`), so neither export
  variant carries keys. `withoutSecrets` stays as a guard for the vault copy: it strips key-like local
  settings (`SECRET_KEY` regex: api key, secret, client id, steam id, token) and the login part of
  `jikanBaseUrl`.
- `parseBackup(text)` validates shape and arrays first, then reads every entry field by field
  ([entryReaders.ts](../../src/shared/storage/entryReaders.ts): an entry needs a text `id` and `title`, anything else
  missing or of the wrong type takes the factory's empty value; settings blocks go through
  [featureSettings.ts](../../src/shared/storage/featureSettings.ts)), and returns `{ backup }` or `{ error: BackupErrorCode }`
  (`BackupParseResult`); invalid JSON is `parseJson`, a non-object `notObject`, any other file that is not a version-2 Hoard file (WatchLog exports included) `unsupportedFormat`. The error is a code (`parseJson`, `titlesMissing`, `unsupportedFormat`, …); the settings tab renders it as `settings.backup.restore.errors.<code>` ([i18n](../architecture/i18n.md)).
- `restoreBackup` adds what is missing and never overwrites existing notes; shared keys found in
  `local` and prototype keys (`__proto__`, `constructor`, `prototype`) are ignored, known `local`
  settings pass through `normalizeSettings` ([settingsCodec.ts](../../src/shared/storage/settingsCodec.ts)). Keys inside `local`
  of an old backup are absorbed by `LocalStore` into secret storage, fill-only
  ([shared vs local](../concepts/shared-vs-local.md)).

The UI (export buttons, file picker, confirmation) lives in the settings tab
([settings](settings.md)); the sequence is in [flows/backup-restore](../flows/backup-restore.md).
WatchLog data is imported through the wizard, not through restore ([import](import.md)).

## Where to change what

- A new top-level section: `BackupFile` in `contract.ts`, `buildBackup`, `parseBackup` validation,
  `restoreBackup` order, and the matching manager snapshot role (`exportSnapshot` / `restore`).
- What counts as a secret: `SECRET_SETTINGS` in `storage/SecretStore.ts` (kept out of backups); `SECRET_KEY` in `backup.ts` only guards the vault copy.
