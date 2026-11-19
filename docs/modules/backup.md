---
type: Module
title: Backup
description: The JSON backup format, the two export variants, validation and the restore contract.
source:
  - src/modules/backup/exports/index.ts
  - src/modules/backup/services/backup.ts
  - src/app/main.ts
  - src/app/wiring/settings.ts
  - src/shared/storage/entryReaders.ts
  - src/shared/storage/featureSettings.ts
  - src/shared/storage/SecretStore.ts
  - src/shared/domain/read.ts
  - src/modules/settings/exports/settingsCodec.ts
source_commit: 4c5ff3ab895535b09f6d6ba5a885a7bf887ffb16
---

# Backup

One file, `version: 2` (`BackupFile` in [exports/index.ts](../../src/modules/backup/exports/index.ts), types only; logic in
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
  [games](games.md) exports; imported type-only). `backupManagers()` in
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
  settings pass through `normalizeSettings` ([settingsCodec.ts](../../src/modules/settings/exports/settingsCodec.ts)). Keys inside `local`
  of an old backup are absorbed by `LocalStore` into secret storage, fill-only
  ([shared vs local](../concepts/shared-vs-local.md)).

The UI (export buttons, file picker, confirmation) lives in the settings tab
([settings](settings.md)); the sequence is in [flows/backup-restore](../flows/backup-restore.md).
WatchLog data is imported through the wizard, not through restore ([import](import.md)).

## Where to change what

- A new top-level section: `BackupFile` in `exports/index.ts` (public surface: the changed surface goes through the `exports-reviewer` agent (`.claude/agents/exports-reviewer.md`) before it is committed), `buildBackup`, `parseBackup` validation,
  `restoreBackup` order, and the matching manager snapshot role (`exportSnapshot` / `restore`).
- What counts as a secret: `SECRET_SETTINGS` in `storage/SecretStore.ts` (kept out of backups); `SECRET_KEY` in `backup.ts` only guards the vault copy.
