---
type: Architecture
title: API layer
description: Which external services exist, how requests, errors and rate limits are handled, and how fetched data reaches notes and cache.
source:
  - src/ApiService.ts
  - src/api/apiError.ts
  - src/PosterService.ts
  - src/apiSources.ts
  - src/titleSearch.ts
  - src/coverRefresh.ts
  - src/cinemetaApi.ts
  - src/openLibraryApi.ts
  - src/steamStoreApi.ts
  - src/apiCheckQueue.ts
source_commit: 554c087c9f4c7b4932c8b73a5b761c39fcc6846d
---

# API layer

Search, autofill, posters and covers work without a key: Cinemeta (movies/TV), Open Library
(books) and the Steam Store (games) are keyless defaults. Community ratings, airing, season refill,
collections and movie/TV studios need keys. APIs fill in posters, covers, episode
counts, release dates, ratings and airing pointers. All of it is **regenerable** and lands in the
[entry cache](../concepts/entry-cache.md), never in a note, except the poster URL (E12) and
user-chosen values.

```mermaid
flowchart LR
  Modals[add modals, detail modals] --> TS[titleSearch / coverRefresh]
  TS --> API[ApiService]
  DM[DataManager] --> Q[ApiCheckQueue]
  Q --> API
  DM --> PS[PosterService queue]
  PS --> API
  API --> Jikan[Tenrai / Jikan v4]
  API --> AniList
  API --> Cinemeta
  API --> OMDb
  API --> TMDB
  API --> OpenLib[Open Library]
  API --> GBooks[Google Books]
  API --> SteamStore[Steam Store search]
  API --> RAWG
  API --> IGDB[IGDB via Twitch token]
  API --> Steam[Steam Web API]
```

## ApiService

One class ([ApiService.ts](../../src/ApiService.ts)) holding the keys and every request method,
grouped by service: anime (`searchAnime` via the Jikan-compatible endpoint, `searchAniList`,
`fetchAiring`), movies/TV (`searchOmdb`, `searchTmdb`, details, seasons, collections, `findTmdbMovieIdByImdbId`),
books (`searchGoogleBooks`), manga (`searchManga`, `getMangaByMalId`), games (`searchRawgGames`,
`searchIgdbGames`, details), Steam (`resolveSteamId`, `getSteamOwnedGames`). Keyed services have a
`check*Connection` for the Settings "Test" button and `has*Key` guards. Keys reach it through
`applyApiKeys` in [main.ts](../../src/main.ts) on every `loadSettings` / `saveSettings`, so a restored
backup or a WatchLog import takes effect without a restart; the Settings tab also sets them directly.

- Every request that can fail with an `ApiError` goes through `requestJson` in `ApiService.ts`
  (`requestVia` picks the source from the URL and adds the Jikan headers; Google Books, the Twitch
  token and IGDB call it with a fixed source): Obsidian's `requestUrl` with `throw: false`, one
  shared timeout (`withTimeout`), and everything that is not a response becomes reason `network`.
- The error model is [apiError.ts](../../src/api/apiError.ts): `ApiError { source, reason }` with
  the reasons `no-key`, `auth`, `not-enabled`, `rate-limited`, `not-found`, `server`, `http`,
  `parse`, `network`. Two tables decide everything:
  - `HTTP_RULES` turns a response outside 2xx into a reason. It is ordered and the first match
    wins, so a service's special case sits above the general rule for the same status (OMDb's 401
    with "limit" in the body, Google's 403 for a disabled API or a spent quota).
  - `REASONS` holds, per reason, the chip label, the sentence, the services with a sentence of
    their own, the outcome of a background check (`transient | nokey | notfound`) and whether the
    credential is the cause (those are re-thrown by detail lookups that otherwise fold failures
    into `null`). `apiErrorMessage` / `apiErrorShort` read it and word the error via
    `t('notices.api.*')` ([i18n](i18n.md)); the service's own explanation from the body is shown
    for `server` and `http` only. `ApiError` messages themselves stay English, for developers.
  `ApiService.ts` re-exports `apiErrorMessage`, `apiErrorShort`, `ApiSource` and `ApiOutcome`, so
  callers import them from there.
- The Steam Web API (`steamGet`) is a second model on purpose: it returns the status with the
  body, because Steam signals expected states by status (400 = no achievements, 403 = private
  profile). It shares only the timeout.
- **Keyless sources** need no credential and are never reported as `auth` (the one exception: a
  Jikan endpoint that was sent a login answers 401 or 403). Their request URLs and
  response mappers are pure modules, so the service methods are one `request` plus a map:
  [cinemetaApi.ts](../../src/cinemetaApi.ts) (`searchCinemeta`, `getCinemetaDetails`; rows carry
  an IMDb id, a poster and the start year; details add seasons from `videos`, runtime and credits;
  a meta record without a top-level `year` is foreign (Cinemeta answers a wrong-kind id with an
  unrelated title) and maps to `null`),
  [openLibraryApi.ts](../../src/openLibraryApi.ts) (`searchOpenLibrary`, `getOpenLibraryWork`; a
  work id `OL…W`, cover by `cover_i`) and [steamStoreApi.ts](../../src/steamStoreApi.ts)
  (`searchSteamStore`, `getSteamStoreDetails` = the existing `getSteamAppDetails` mapped to a game;
  also `steamLibraryCover`, the portrait capsule). `ApiSource` gained `cinemeta`, `openLibrary`,
  `steamStore` for error wording.
- AniList calls are serialised with a minimum gap; GraphQL errors in a 200 body are detected.
- IGDB needs a Twitch app token (`getIgdbToken`, cached with expiry); a rejected client id/secret
  reports source `twitch`, not `igdb`.
- The Jikan endpoint is configurable ([jikanBase.ts](../../src/jikanBase.ts)): https only, optional
  Basic auth from the URL, Tenrai as default, credentials never sent to Tenrai.
- URLs from responses pass `httpsOrEmpty` before they are stored.
- Search limits: 9 results per page, 3 pages (`SEARCH_RESULT_LIMIT`); year filters accept only a
  plain 4-digit year.

## Routing

[apiSources.ts](../../src/apiSources.ts) is the one resolver: `effectiveMediaSource`,
`effectiveBookSource`, `effectiveGameSource` return the chosen source (`activeApi`,
`booksApiSource`, `gamesApiSource`) if it is keyless or its key is set, else the keyless one
(Cinemeta, Open Library, Steam). Nothing is migrated: an old `activeApi: 'OMDb'` without a key just
resolves to Cinemeta. Every reader goes through it, never through the raw setting.

- [titleSearch.ts](../../src/titleSearch.ts): `getApiGroupForType(type, typeApiMapping)` → anime
  (Jikan or AniList by `animeApiSource`) or movie/series by the effective media source (Cinemeta,
  OMDb, TMDB; `fetchMediaDetails` follows the same). `resultIdKeys` takes that source, because
  `imdbId` on a row is a TMDB id under TMDB.
- [coverRefresh.ts](../../src/coverRefresh.ts): `searchBooks` (Google Books or Open Library) and
  `resolveGameCover` (stored id → that source, else title search in the effective game source);
  reading covers by Open Library, Google Books or MAL id. Bulk refresh needs an id (Google-only
  books also need a key).
- Add modals call the resolver directly for book and game search; `AddFromUrlModal` resolves an
  IMDb link through the effective source (Cinemeta: series first, then movie — the movie endpoint
  returns an unrelated film for many series ids, the series endpoint returns `{}` for movie ids).

## Background work

- [PosterService](../../src/PosterService.ts): a serial queue with per-service delays; movie/TV
  order is TMDB key → OMDb key → Cinemeta (by IMDb id, else title search with year; with no kind signal
  series before movie), regardless of
  `activeApi`; the `ApiService` for Cinemeta arrives through the injected `getApi` from `main.ts`.
  The result is written by `DataManager.updatePosterUrl` writes it into the note only when the note has none
  (or always on explicit refresh). A failure is not cached as `'none'`, so a bad key does not burn
  "no poster" into every title.
- [ApiCheckQueue](../../src/apiCheckQueue.ts): at most 2 parallel tasks, 250 ms apart. Used by
  `DataManager.refillSeasons` and `refreshAiring`; the result (`ok | transient | nokey | notfound`)
  is stamped into `cache.apiCheck` with a per-outcome retry deadline (`apiCheckDue`), and
  `resetNoKeyChecks` re-arms `nokey` checks when a key changes. Community rating, airing, season
  refill and collections stay keyed (OMDb/TMDB/AniList/MAL). `fetchCredits` tries Cinemeta first
  when it is the effective source, else after TMDB/OMDb; Cinemeta errors propagate so the detail
  modal leaves credits unfetched and retries. The studio backfill is skipped for movies/TV without
  a TMDB key instead of storing `none`.

## Where to change what

- New service: methods in `ApiService` plus `apiSourceFromUrl`, a key field and a Settings card
  ([settings](../modules/settings.md)); in `apiError.ts` the `ApiSource` member and its label, and,
  only if the service needs them, a row in `HTTP_RULES` and a key under `textFor` in `REASONS`.
- New keyless source: a pure `*Api.ts` mapper module, `ApiSource` + `KEYLESS_SOURCES` (in
  `apiError.ts`) + `apiSourceFromUrl`, a value in the `apiSources.ts` union and resolver, an
  [external id](../concepts/external-id.md) source and a `LibraryIndex` key.
- A new failure reason: `ApiErrorReason` and its row in `REASONS`; the compiler asks for the row.
- New per-type routing: `typeApiMapping` and `getApiGroupForType` in `types.ts`.
