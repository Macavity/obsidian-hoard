---
type: Domain
title: Entry cache
description: What data.json keeps per entry, why API data lives there and not in the note, and how it is kept in step.
source:
  - src/storage/storageTypes.ts
  - src/storage/titleCodec.ts
  - src/storage/LocalStore.ts
  - src/storage/EntryIndex.ts
  - src/DataManager.ts
source_commit: d4cf7e39e4fc24687cf810e7417d26726e840ee6
---

# Entry cache

`LocalData.cache` in `data.json` holds one `EntryCache` per entry id: **API-derived, regenerable
data that must not become note content**. Cached fields (see
[storageTypes.ts](../../src/storage/storageTypes.ts)): poster marker, trailer, director, cast, studio,
community rating/votes/source/last fetch, TMDB collection id, seasons, resolved ids
(`tmdbId`, `tmdbMediaType`, `malId`, `anilistId`), the last background `apiCheck` per kind
(`airing`, `seasons`, with result `ok | transient | nokey | notfound`) and the `airing` pointer.

Code comments cite the decisions by number: **E9** = API values live in the cache, only user
overrides are written to the note; **E12** = the poster URL is a plain note field (`poster`), the cache
only keeps the marker `'none'` for "the API has no poster".

## How note and cache merge

- `decodeTitle(id, properties, cache)` builds the in-memory title: note values win, cache fills
  the rest. `externalId` in the note wins over cached ids. A `seasons` list in the note sets
  `seasonsOverride` and beats cached seasons.
- `splitCache(title)` is the inverse for the cache side; `TITLE_CACHE_KEYS` names the keys it owns.
  `DataManager.syncCache` replaces those keys and keeps everything else (`apiCheck`, `airing`,
  refilled seasons the title does not carry).
- Reading and game entries have no decoder-side cache merge: their codecs read the note only. The
  cache map is still keyed by their ids for `sweepCache` and renames.

## Lifecycle

- `EntryIndex.sweepCache()` (once after build) drops entries whose note is gone.
- `EntryIndex` deletes the cache on vault delete and re-keys it on rename.
- `LocalStore` debounces writes (100 ms) and is **read-only** for the session when `data.json` holds a
  WatchLog schema-1 file or a newer schema version.
- A device without cache (fresh sync) sees titles with an API identity but no poster or seasons;
  `DataManager.queueMissingPosters` / `queueMissingSeasons` refill through the throttled
  [ApiCheckQueue](../architecture/api-layer.md). Until seasons arrive, `seasonsPending` keeps episode
  toggles from mapping onto an implicit season.

Related: [shared vs local](shared-vs-local.md), [external id](external-id.md),
[architecture/storage](../architecture/storage.md).
