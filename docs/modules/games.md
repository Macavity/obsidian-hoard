---
type: Module
title: Games
description: The game model and its text-encoded fields, how Steam sync matches and updates, and how covers are resolved.
source:
  - src/GameDataManager.ts
  - src/storage/gameCodec.ts
  - src/GamesTab.ts
  - src/GameDetailModal.ts
  - src/AddGameModal.ts
  - src/GameScheduleModal.ts
  - src/SteamSyncModal.ts
  - src/ApiService.ts
  - src/coverRefresh.ts
source_commit: 554c087c9f4c7b4932c8b73a5b761c39fcc6846d
---

# Games

One note per game under `Games/`. [GameDataManager.ts](../../src/GameDataManager.ts) owns copies,
writes, derived groups, Upcoming sync and history; [gameCodec.ts](../../src/storage/gameCodec.ts)
maps properties to `Game`. Writes follow [flows/entry-write](../flows/entry-write.md); one
difference to reading: `flushViews` also diffs handed-out copies against their baseline, so an
in-place mutation without a `*Silent` call is still written. UI: [GamesTab.ts](../../src/GamesTab.ts),
[AddGameModal.ts](../../src/AddGameModal.ts) (Steam Store by default, RAWG or IGDB once keyed, per `effectiveGameSource`; never a "no API" panel),
[GameDetailModal.ts](../../src/GameDetailModal.ts) (draft object, persisted on Save),
[GameScheduleModal.ts](../../src/GameScheduleModal.ts) (single date, also sets `releaseDate`),
[SteamSyncModal.ts](../../src/SteamSyncModal.ts) (from the Steam settings card).

## Model

- **Status** is a user-configurable string list (defaults Playing, Not started, Finished, Dropped,
  To be released, TBA). "To be released" is automatic: a future `releaseDate` forces it, a past or
  cleared one reverts to `defaultStatus`. "TBA" is manual and never touched. "Finished" logs as
  completed and stamps `dateFinished` when `setFinishDateAutomatically` is on.
- `Progress` is a completion percent; the modal offers ±5 steps and a value derived from achievements.
- **Text-encoded fields**: `Playtime` as `12h 30m` / `1,234h` / `45m` (written only when > 0;
  the decoder is strict and flags garbage as invalid; the modal input also accepts `1.5h`, `2:30`,
  bare hours), `Achievements` as `earned/total` (written only when total > 0).
- `Genre` holds `Game.type`; `Type: game` is the kind marker. `External ID` carries RAWG, IGDB or Steam
  source and id (`steam:<appid>`); `Steam App ID`, `Last Played`, `Store URL` (Steam, then GOG, then Epic when
  API-filled) are separate. `Wishlist` is a flag independent of status.
- **Groups are derived** from the `Groups` property; id = name; an empty group does not exist.
- **Settings split**: `defaultStatus`, `statuses`, `types`, `platforms` sync; `rowsLayout`, saved
  filter and daily picks stay local; Steam key and id are device-local plugin settings
  ([shared vs local](../concepts/shared-vs-local.md)).

## Steam sync

1. The settings field accepts a SteamID64, profile URL or vanity name; `resolveSteamId`
   normalises it (vanity needs the API key) and the Test button stores the resolved id.
2. `getSteamOwnedGames` returns `{ ok, reason, games }`; reasons `missing`, `badKey` (401/403),
   `network`, `private` (200 without `games`), `empty`. The modal maps each to user text.
3. `matchAgainstLibrary`: by stored `steamAppId`, by app id parsed from `storeUrl`, then by
   normalised title; a library game is claimed at most once. The rest is offered as a checklist.
4. Run: optional achievements (one request per game; null leaves stored counts alone), then one
   `applySteamSync` that overwrites playtime, `lastPlayed`, `steamAppId` and achievements, fills an
   empty `storeUrl`, and never touches status, rating, notes or `dateModified`.
5. Selected new games get storefront details (rate-limited, best effort) and `buildGame`: first
   status that is not "To be released", genre only if it matches a configured type, cover = Steam
   capsule.

## Search and add

`AddGameModal.search` follows `effectiveGameSource` ([apiSources.ts](../../src/apiSources.ts)): the
chosen source if keyed, else the keyless **Steam Store** search (`searchSteamStore`, apps only, rows
with the portrait capsule). A pick fetches details by the row's own source (Steam: `appdetails`
mapped through `getSteamStoreDetails`; missing details fall back to the search row) and stores `apiSource` + `apiId`; a Steam pick also sets
`steamAppId`, so a later Steam sync matches by id. Non-Steam picks still derive `steamAppId` from a
Steam store link. See [api layer](../architecture/api-layer.md).

## Covers

`resolveGameCover` ([coverRefresh.ts](../../src/coverRefresh.ts)): a game with stored source and
id uses that source's cover regardless of the setting (Steam: `steamLibraryCover`, no request, now
in `steamStoreApi.ts`); otherwise a title search in the effective source, first result with a cover
wins. Only the cover is persisted, only when empty; the found id is
not written. "Refresh all" is id-only. IGDB uses a cached Twitch token; RAWG images are rewritten
to a smaller size for display.

## Where to change what

| Change | Place |
|---|---|
| Property format, playtime, achievements | `gameCodec.ts`; `formatTime`, `parsePlaytimeInput` in `types.ts` |
| Default statuses, genres, platforms | `defaultGamesSettings()` in `types.ts` |
| Release status and Upcoming | `applyReleaseStatus`, `syncUpcoming` in the manager |
| Steam matching and import defaults | `matchAgainstLibrary`, `buildGame` in `SteamSyncModal.ts` |
| Steam, RAWG, IGDB requests | `ApiService.ts`; Steam Store mapping and `steamLibraryCover` in `steamStoreApi.ts` |
| Recommended and Recently played shelves | `getRecommendedGames`, `getRecentlyPlayedGames` in `GamesTab.ts` |
