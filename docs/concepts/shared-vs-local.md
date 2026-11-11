---
type: Domain
title: Shared vs local settings
description: Which settings sync through Hoard.base, which stay in data.json, which live in secret storage, and why an API key never reaches the base.
source:
  - src/storage/SharedConfigStore.ts
  - src/settingsSplit.ts
  - src/storage/LocalStore.ts
  - src/storage/storageTypes.ts
  - src/storage/SecretStore.ts
source_commit: cda80ae35181b2c9dfc2b412818e2a0ca596a18f
---

# Shared vs local settings

Settings are one object in memory (`plugin.settings`) but three places on disk:

| Where | What | Synced |
|---|---|---|
| `hoard:` block in `<root>/Hoard.base` | the vocabulary every device needs to read and write the same notes: `types`, `statuses`, `reviews`, `priorities`, `halfStarRatings`, `typeApiMapping`, `episodeNumbering`, `defaultCustomColumns`, `autoCompleteOnLastEpisode`, `setFinishDateAutomatically`, plus inside `reading`: `defaultStatus`, `bookColumns`, `mangaColumns`; inside `games`: `defaultStatus`, `statuses`, `types`, `platforms` | yes |
| `data.json` of the plugin ([LocalStore](../../src/storage/LocalStore.ts)) | everything else: colours, palettes, layouts, saved filters, UI state, the [entry cache](entry-cache.md) | no |
| Obsidian secret storage (`app.secretStorage`, [SecretStore](../../src/storage/SecretStore.ts)) | the nine `SECRET_SETTINGS`: OMDb, TMDB, Google Books, RAWG, Steam API keys, IGDB client id and secret, Steam id, `jikanBaseUrl` (may carry a login), under fixed ids `hoard-*` | no, per device |

The whitelist is `SHARED_SETTING_KEYS` and `NESTED_SHARED_KEYS` in
[SharedConfigStore.ts](../../src/storage/SharedConfigStore.ts). `pick()` applies it on every read and
write, so the plugin never writes an unlisted key into the base, whatever the caller passes. An unlisted
top-level key someone put into the block by hand is preserved on update, not purged (so a key
pasted there stays synced until removed by hand); only `RETIRED_KEYS` (`ratingSystem`,
`seasonPalette`, `readingTypeColors`) are deleted on the next write. Inside `reading` and `games`
the whole object is replaced, so unlisted nested keys do not survive.

## Composition and persistence

- `composeSettings(local, shared, secrets)` = `DEFAULT_SETTINGS` ← local ← secrets ← shared (shared
  wins), except that secret keys found in the base are dropped (`withoutSecrets`), followed by
  backfills and migrations for older data ([settingsSplit.ts](../../src/settingsSplit.ts)).
- `persistSettings` splits by the whitelist: secret keys go to `SecretStore.write`; a key the storage
  refuses (`write` returns it after a read-back) stays in `data.json` instead of being lost. Other non-shared keys replace `local.data.settings`; for shared
  keys it computes what differs from "defaults + current base" and calls `SharedConfigStore.update`
  with only those. No difference means no write to the base.
- `SharedConfigStore.update` patches only the `hoard:` block; the rest of the base file
  (filters, views) stays byte-identical ([baseFile.ts](../../src/storage/baseFile.ts)). An unreadable
  block is left alone and reported through the injected `Notify` (`sharedConfigUnreadable`).
- The store watches `modify` on the base; an own write echoes back identical content and is ignored
  by comparing canonical JSON, a foreign change reloads and re-composes settings.

## Fresh install and sync

Without a base, `deferBase` holds a creator: the base is created on the first write that needs
it, a user-initiated note write (`EntryIndex.onLocalWrite`) or a changed shared setting
(`update` → `ensureBase`), or adopted when one appears by sync (`appeared`). See
[flows/startup](../flows/startup.md).

## Secrets

`SecretStore.absorb` migrates keys left in `data.json` (older versions, restore, import): fill-only
(an existing secret wins), and a key leaves the record only after a read-back confirms it is stored.
`LocalStore` runs it on load and before every save, so keys never stay on disk in `data.json`, and sets
`secretsInStorage`. Secret storage does not sync: on a device that has the marker but an empty store,
`main.ts` shows a one-time notice ([startup](../flows/startup.md)).

Backups never carry keys; an old backup's keys only fill empty storage on restore
([modules/backup](../modules/backup.md)).
