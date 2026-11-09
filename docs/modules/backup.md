---
type: Module
title: Backup
description: The JSON backup format, the two export variants, validation and the restore contract.
source:
  - src/backup.ts
  - src/main.ts
source_commit: 3cf70e7d99442c30c753b169d4da73e2ad38a964
---

# Backup

One file, `version: 2` ([backup.ts](../../src/backup.ts), `BackupFile`):

```
entries: { titles, maybe, reading: { books, manga, settings }, games: { games, settings } }
shared:  the hoard: block of the base
local:   device-local settings (API keys included in the download variant)
history: all entries
```

- `buildBackup(managers)` reads through the manager APIs only; `plugin.backupManagers()` in
  [main.ts](../../src/main.ts) assembles managers, stores and an `importContext`.
- `withoutSecrets` strips key-like local settings (`SECRET_KEY` regex: api key, secret, client id,
  steam id, token) and the login part of `jikanBaseUrl` before a copy goes into the vault.
- `parseBackup(text)` validates shape and arrays first and returns `{ backup }` or `{ error: BackupErrorCode }`; any non-version-2 object (WatchLog exports included) is `unsupportedFormat`. The error is a code (`parseJson`, `titlesMissing`, `unsupportedFormat`, …); the settings tab renders it as `settings.backup.restore.errors.<code>` ([i18n](../architecture/i18n.md)).
- `restoreBackup` adds what is missing and never overwrites existing notes; shared keys found in
  `local` and prototype keys (`__proto__`, `constructor`, `prototype`) are ignored.

The UI (export buttons, file picker, confirmation) lives in the settings tab
([settings](settings.md)); the sequence is in [flows/backup-restore](../flows/backup-restore.md).
WatchLog exports are not restorable ([import](import.md)).

## Where to change what

- A new top-level section: `BackupFile`, `buildBackup`, `parseBackup` validation, `restoreBackup`
  order, and the matching manager `exportSnapshot` / `restore`.
- What counts as a secret: `SECRET_KEY` in `backup.ts`.
