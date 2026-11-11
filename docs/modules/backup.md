---
type: Module
title: Backup
description: The JSON backup format, the two export variants, validation and the restore contract.
source:
  - src/backup.ts
  - src/main.ts
source_commit: f3d78f8aae44aa4446d6c4f042c5c803ca8ae3a5
---

# Backup

One file, `version: 2` ([backup.ts](../../src/backup.ts), `BackupFile`):

```
entries: { titles, maybe, reading: { books, manga, settings }, games: { games, settings } }
shared:  the hoard: block of the base
local:   device-local settings, never API keys (they live in secret storage)
history: all entries
```

- `buildBackup(managers)` reads through the manager APIs only; `plugin.backupManagers()` in
  [main.ts](../../src/main.ts) assembles managers, stores and an `importContext` (the
  [import wizard](import.md) writes through it; backup restore does not use it).
- `buildBackup` drops the nine `SECRET_KEYS` from `local` (`withoutSecretSettings`), so neither export
  variant carries keys. `withoutSecrets` stays as a guard for the vault copy: it strips key-like local
  settings (`SECRET_KEY` regex: api key, secret, client id, steam id, token) and the login part of
  `jikanBaseUrl`.
- `parseBackup(text)` validates shape and arrays first and returns `{ backup }` or `{ error: BackupErrorCode }`;
  invalid JSON is `parseJson`, a non-object `notObject`, any other file that is not a version-2 Hoard file (WatchLog exports included) `unsupportedFormat`. The error is a code (`parseJson`, `titlesMissing`, `unsupportedFormat`, …); the settings tab renders it as `settings.backup.restore.errors.<code>` ([i18n](../architecture/i18n.md)).
- `restoreBackup` adds what is missing and never overwrites existing notes; shared keys found in
  `local` and prototype keys (`__proto__`, `constructor`, `prototype`) are ignored. Keys inside `local`
  of an old backup are absorbed by `LocalStore` into secret storage, fill-only
  ([shared vs local](../concepts/shared-vs-local.md)).

The UI (export buttons, file picker, confirmation) lives in the settings tab
([settings](settings.md)); the sequence is in [flows/backup-restore](../flows/backup-restore.md).
WatchLog data is imported through the wizard, not through restore ([import](import.md)).

## Where to change what

- A new top-level section: `BackupFile`, `buildBackup`, `parseBackup` validation, `restoreBackup`
  order, and the matching manager `exportSnapshot` / `restore`.
- What counts as a secret: `SECRET_SETTINGS` in `storage/SecretStore.ts` (kept out of backups); `SECRET_KEY` in `backup.ts` only guards the vault copy.
