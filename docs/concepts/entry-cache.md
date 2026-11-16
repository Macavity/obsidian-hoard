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
  - src/storage/read.ts
  - src/storage/readCache.ts
  - src/storage/cacheMigration.ts
  - src/lookup.ts
source_commit: 5ac1323c9eec908b3ce2098f3bb6dceb43656b07
---

# Entry cache

`LocalData.cache` in `data.json` holds one `EntryCache` per entry id: **API-derived, regenerable
data that must not become note content**. Cached fields (see
[storageTypes.ts](../../src/storage/storageTypes.ts)): trailer, director, cast, studio,
community rating/votes/source/last fetch, TMDB collection id, seasons, resolved ids
(`tmdbId`, `tmdbMediaType`, `malId`, `anilistId`), the last background `apiCheck` per kind
(`airing`, `seasons`, `poster`, `trailer`, `credits`, `studio`, with result
`ok | transient | nokey | notfound`) and the `airing` pointer. The poster is not cached: it is the note's `Cover`.

Code comments cite the decisions by number: **E9** = API values live in the cache, only user
overrides are written to the note; **E12** = the poster URL is a plain note field (`Cover`); "the API
has no poster" is a `notfound` check of kind `poster`, not a value. No cache field, note or in-memory
title holds the string `'none'` any more.

## How note and cache merge

- `titleFromProperties(id, properties, cache)` builds the in-memory title: note values win, cache fills
  the rest. `External ID` in the note wins over cached ids. A `Seasons` list in the note sets
  `seasonsOverride` and beats cached seasons.
- `titleToCache(title)` is the inverse for the cache side; `TITLE_CACHE_KEYS` names the keys it owns.
  `DataManager.syncCache` replaces those keys and keeps everything else (`apiCheck`, `airing`,
  refilled seasons the title does not carry).
- Reading and game entries have no decoder-side cache merge: their codecs read the note only. The
  cache map is still keyed by their ids for `sweepCache` and renames.

## Fetch state

Poster, trailer, credits (director and cast together) and studio have four states, derived rather than
stored as a field ([lookup.ts](../../src/lookup.ts), `DataManager.lookupDue` / `recordLookup`):

| State | Where it shows |
|---|---|
| not fetched | no value, no `apiCheck` entry |
| found | the value (note or cache); **final**, never re-checked automatically |
| nothing found | `apiCheck[kind].result = 'notfound'`, due again after 7 d |
| failed | `apiCheck[kind].result = 'transient'` (network, timeout, 5xx, rate limit), due again after 1 h |

A lookup is due when there is no value and the check is absent or past its deadline
(`API_CHECK_TTL_MS`: `transient` 1 h, `notfound` 7 d; `ok` 6 h applies to airing and seasons only). A
found value records nothing; only the explicit refresh paths (`overwrite`, the trailer refresh button,
cover refresh) fetch it again. `nokey` waits until a key changes: `resetNoKeyChecks` clears the `nokey`
checks of every kind. The poster is retried by the poster queue; trailer, credits and studio at the next
detail-view open after the deadline. A note value always wins over the cache. An image that fails to
load stores nothing: a dead `Cover` stays the user's value.

## Reading data.json

`LocalStore.read` takes the file field by field ([readCache.ts](../../src/storage/readCache.ts), readers in
[read.ts](../../src/storage/read.ts)): a field of the wrong type is dropped, the entry and its other
fields stay; an `apiCheck` entry needs a known kind, a known result and a timestamp.

**Migration of `'none'`.** Older versions kept `posterUrl: 'none'`, `trailerUrl: 'none'` and `['none']`
for director, cast or studio in the cache. On load
([cacheMigration.ts](../../src/storage/cacheMigration.ts), `migrateNoneMarkers`) each marker becomes
`apiCheck[kind] = { at: <load time>, result: 'notfound' }` and the value is dropped, so migrated titles
are re-checked a week after the upgrade, not all at once. An existing check is kept, and a note value
is never touched (it wins over the cache anyway). `posterUrl` is no cache field any more and goes
either way. The result is saved when the store is writable; on a read-only store (WatchLog schema-1 or
newer file) it is translated in memory each session.

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
