---
type: Domain
title: Shared vs local settings
description: Which settings sync through Hoard.base, which stay in data.json, and why the plugin never writes an API key into the base.
source:
  - src/storage/SharedConfigStore.ts
  - src/settingsSplit.ts
  - src/storage/LocalStore.ts
  - src/storage/storageTypes.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Shared vs local settings

Settings are one object in memory (`plugin.settings`) but two on disk:

| Where | What | Synced |
|---|---|---|
| `hoard:` block in `<root>/Hoard.base` | the vocabulary every device needs to read and write the same notes: `types`, `statuses`, `reviews`, `priorities`, `halfStarRatings`, `typeApiMapping`, `episodeNumbering`, `defaultCustomColumns`, `autoCompleteOnLastEpisode`, `setFinishDateAutomatically`, plus inside `reading`: `defaultStatus`, `bookColumns`, `mangaColumns`; inside `games`: `defaultStatus`, `statuses`, `types`, `platforms` | yes |
| `data.json` of the plugin ([LocalStore](../../src/storage/LocalStore.ts)) | everything else: API keys, Steam id, colours, palettes, layouts, saved filters, UI state, the [entry cache](entry-cache.md) | no |

The whitelist is `SHARED_SETTING_KEYS` and `NESTED_SHARED_KEYS` in
[SharedConfigStore.ts](../../src/storage/SharedConfigStore.ts). `pick()` applies it on every read and
write, so the plugin never writes an unlisted key into the base, whatever the caller passes. An unlisted
top-level key someone put into the block by hand is preserved on update, not purged (so a key
pasted there stays synced until removed by hand); only `RETIRED_KEYS` (`ratingSystem`,
`seasonPalette`, `readingTypeColors`) are deleted on the next write. Inside `reading` and `games`
the whole object is replaced, so unlisted nested keys do not survive.

## Composition and persistence

- `composeSettings(local, shared)` = `DEFAULT_SETTINGS` ← local ← shared (shared wins), followed by
  backfills and migrations for older data ([settingsSplit.ts](../../src/settingsSplit.ts)).
- `persistSettings` splits by the whitelist: non-shared keys replace `local.data.settings`; for shared
  keys it computes what differs from "defaults + current base" and calls `SharedConfigStore.update`
  with only those. No difference means no write to the base.
- `SharedConfigStore.update` patches only the `hoard:` block; the rest of the base file
  (filters, views) stays byte-identical ([baseFile.ts](../../src/storage/baseFile.ts)). An unreadable
  block is left alone with a Notice.
- The store watches `modify` on the base; an own write echoes back identical content and is ignored
  by comparing canonical JSON, a foreign change reloads and re-composes settings.

## Fresh install and sync

Without a base, `deferBase` holds a creator: the base is created on the first write that needs
it, a user-initiated note write (`EntryIndex.onLocalWrite`) or a changed shared setting
(`update` → `ensureBase`), or adopted when one appears by sync (`appeared`). See
[flows/startup](../flows/startup.md).

Backups follow the same split: `withoutSecrets` strips key-like local settings before a copy is
written into the vault ([modules/backup](../modules/backup.md)).
