---
type: Module
title: Games
description: How games are modelled and written, how Steam sync and cover resolution work, and where to change games behaviour.
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
  - src/storage/SharedConfigStore.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Games

## Purpose / Boundary

One note per game under `Games/`; id = note path ([storage](../architecture/storage.md), [entry-id](../concepts/entry-id.md)). [GameDataManager.ts](../../src/GameDataManager.ts) owns views, writes, groups, Upcoming sync and history; [gameCodec.ts](../../src/storage/gameCodec.ts) maps properties to `Game`. Structurally a sibling of [reading](reading.md) (same views/baseline/afterWrite pattern, see [entry-write](../flows/entry-write.md)).

## Entry points

- Tab: [GamesTab.ts](../../src/GamesTab.ts) (grid of games plus group cards, Rows shelves incl. daily Recommended and Recently played, filters incl. platform/wishlist/groups-only).
- Add: [AddGameModal.ts](../../src/AddGameModal.ts) (search via RAWG or IGDB per `settings.gamesApiSource`; duplicate title check; optional group).
- Detail: [GameDetailModal.ts](../../src/GameDetailModal.ts) (draft object, persisted by Save; also `GameGroupDetailModal`).
- Schedule: [GameScheduleModal.ts](../../src/GameScheduleModal.ts), single release date only (no recurring, no counters); saving also sets `releaseDate`.
- Steam: [SteamSyncModal.ts](../../src/SteamSyncModal.ts), opened from the API settings card (`SettingsTab.ts`, "Sync now").

## Model (`Game`)

- Status is a free string from `GamesSettings.statuses` (user-configurable, with colours). Defaults: `Playing`, `Not started`, `Finished`, `Dropped`, `To be released`, `TBA`. `To be released` (`GAME_AUTO_STATUS`) is automatic: future `releaseDate` forces it, once past/cleared it reverts to the `defaultStatus` (`applyReleaseStatus`). `TBA` is manual, never auto-set/cleared. `Finished` (`GAME_FINISHED_STATUS`) logs as "completed" and stamps `dateFinished` when `setFinishDateAutomatically` is on.
- `progress`: completion percent 0-100 (no counters). The detail modal offers +/-5 steps and a "= N%" shortcut derived from achievements.
- `playtime`: stored as text via `formatTime` (`12h 30m`, `1,234h`, `45m`), written only when > 0; decoder `parsePlaytime` is strict and flags unparseable text as an invalid field. The modal input accepts free-form text (`parsePlaytimeInput`: `42h 30m`, `1.5h`, `2:30`, bare number = hours).
- `achievements`: text `earned/total`, written only when total > 0.
- `platforms` (names from settings), `singleplayer`/`coop`/`multiplayer` flags, `priority`, `rating`, `favorite`/`dateFavorited`, `wishlist` (flag, independent of status, so a game can be wishlisted and TBA).
- `genre` property holds `Game.type`; `type: game` is the kind marker. `externalId` holds RAWG/IGDB source+id (`apiSource`, `apiId`); `steamAppId` and `lastPlayed` are separate; `storeUrl` prefers Steam, then GOG, then Epic when API-filled ([external-id](../concepts/external-id.md)).
- Groups: no group store. `getGroups()` derives groups from the `groups` property on notes (id = name); an empty group does not exist; delete/rename rewrites members (`setMembership`).

## How it works

**Writes.** Same mechanics as reading: `writeGame` renames on title change and sets only changed keys via `processFrontMatter`, `afterWrite` updates the index optimistically ([baseline](../concepts/baseline.md)). `createNote` writes body `## Notes`; `readGameNotes`/`writeGameNotes` replace only that section (detail modal writes it only when loaded or edited). Difference to reading: `flushViews` also detects in-place mutation of handed-out copies by diffing `encodeGame(view)` against its baseline, not just the dirty set. Future-dated games are mirrored into Upcoming (`syncUpcoming`, on release-date change and `init()`), see [upcoming](upcoming.md).

**Steam sync flow.**
1. Settings: the Steam ID field accepts a SteamID64, a profile URL, or a vanity name; `resolveSteamId` normalises it (vanity needs the API key) and the test button stores the resolved id. Credentials via `setSteamCredentials`.
2. `getSteamOwnedGames` (one request) returns `{ok, reason, games}`. Failure reasons: `missing` (no key/id), `badKey` (HTTP 401/403), `network` (other status or exception), `private` (200 with no `games`; Steam's private-profile shape), `empty` (`game_count` 0). `failureMessage` in the modal maps them to user text.
3. `matchAgainstLibrary` matches each Steam game to a library game by stored `steamAppId` or app id parsed from `storeUrl`, then normalised title; a library game is claimed at most once. Rest = "not in your library", offered as a checklist.
4. Run: optional achievements (`getSteamAchievements`, one request per game; null = no achievements, stored counts untouched). Cancel is checked once per iteration. Matched updates are applied in one `applySteamSync`: overwrites `playtimeMinutes`, `lastPlayed`, `steamAppId`, achievements, fills an empty `storeUrl`; no `dateModified` stamp, never touches status/rating/notes.
5. Selected new games: `getSteamAppDetails` (storefront, rate-limited, best-effort) then `buildGame` (first status that is not `To be released`, genre only if it matches a configured type, cover = Steam library capsule) and `addGame`.

**Cover resolution.** `GamesTab.handleCoversVisible` lazily resolves covers for cards without one through `resolveGameCover` in [coverRefresh.ts](../../src/coverRefresh.ts): a game with stored `apiSource`+`apiId` uses that source's details call (RAWG or IGDB) regardless of the setting; otherwise a title search in the source chosen by `gamesApiSource` (needs RAWG key or IGDB Twitch credentials), first result wins. Only the cover is persisted (`updateCoverUrl` only when `coverUrl` is empty); the found source/id are not written. `refreshAllCovers` uses id-only mode and skips games without an id. IGDB uses a cached Twitch client-credentials token; `rawgResizedCover` rewrites heavy RAWG images for display. See [api-layer](../architecture/api-layer.md).

## Settings split

`splitNested('games', ...)` ([SharedConfigStore.ts](../../src/storage/SharedConfigStore.ts)): shared (`Hoard.base`) = `defaultStatus`, `statuses`, `types`, `platforms`; local (`data.json`) = `rowsLayout`, `savedFilterPreset`; `defaultFolder` is dropped. Daily Recommended picks live in `data.json` ui state. `gamesApiSource`, Steam key and id are plugin settings (`steamApiKey`, `steamId`). `getSettings()` falls back to defaults for empty lists. See [shared-vs-local](../concepts/shared-vs-local.md), [settings](settings.md).

## Where to change what

| Change | Place |
|---|---|
| Property names/format, playtime, achievements | `gameCodec.ts`, `formatTime`/`parsePlaytimeInput` in `types.ts` |
| Default statuses/genres/platforms | `defaultGamesSettings()` in `types.ts` |
| Release status / Upcoming | `applyReleaseStatus`, `syncUpcoming` in `GameDataManager.ts` |
| Steam matching, import defaults | `SteamSyncModal.ts` (`matchAgainstLibrary`, `buildGame`) |
| Steam/RAWG/IGDB requests | `ApiService.ts` (`getSteam*`, `*Rawg*`, `*Igdb*`) |
| Cover rules | `coverRefresh.ts`, `GamesTab.handleCoversVisible` |
| Recommended / Recently played shelves | `getRecommendedGames`, `getRecentlyPlayedGames` in `GamesTab.ts` |

## Links

[storage](../architecture/storage.md) · [api-layer](../architecture/api-layer.md) · [entry-write](../flows/entry-write.md) · [add-title](../flows/add-title.md) · [reading](reading.md) · [upcoming](upcoming.md) · [settings](settings.md) · [external-id](../concepts/external-id.md) · [baseline](../concepts/baseline.md)
