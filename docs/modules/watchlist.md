---
type: Module
title: Watchlist
description: What the Watchlist domain (movies, TV, anime) does, which file owns what, how a title reaches its note and back, and where to change a given behaviour.
source:
  - src/DataManager.ts
  - src/ListTab.ts
  - src/TitleDetailModal.ts
  - src/EditTitleModal.ts
  - src/AddTitleModal.ts
  - src/AddFromUrlModal.ts
  - src/CollectionModal.ts
  - src/CommunityRating.ts
  - src/MaybeAddModal.ts
  - src/storage/titleCodec.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Watchlist

## Purpose / Boundary

Tracks titles of user-defined types (Movie, TV Show, Anime, ... from `settings.types`): status, priority, rating, review, notes, seasons with watched/skipped episodes, groups, favorites, release date, plus API-derived data (poster, trailer, director/cast/studio, community rating, TMDB collection). One note per title ([entry id](../concepts/entry-id.md) = note path). Storage mechanics live in [storage](../architecture/storage.md); this page is the domain layer above it.

Not here: Upcoming/airtime UI ([upcoming](upcoming.md); `DataManager` only owns the data), books/games ([reading](reading.md), [games](games.md)), API clients ([api-layer](../architecture/api-layer.md)).

## Entry points

| Concern | Owner |
|---|---|
| State + all writes | [DataManager.ts](../../src/DataManager.ts) (`getTitles`, `addTitle`, `updateTitle`, groups, Maybe, episode toggles, API backfills) |
| Main tab (Rows shelves or List table, filters, sort, selection, groups) | [ListTab.ts](../../src/ListTab.ts) |
| Detail modal (episodes, rating, credits, studio, trailer, collection button) + `GroupDetailModal` | [TitleDetailModal.ts](../../src/TitleDetailModal.ts) |
| Edit form (title, type, episodes, link, poster/trailer override, seasons text, group) | [EditTitleModal.ts](../../src/EditTitleModal.ts) |
| Add flow | [AddTitleChoiceModal.ts](../../src/AddTitleChoiceModal.ts) -> [AddFromUrlModal.ts](../../src/AddFromUrlModal.ts) or [AddTitleModal.ts](../../src/AddTitleModal.ts); [AddRouter.ts](../../src/AddRouter.ts) for loose strings from Drafts/Custom Lists |
| Maybe titles | [MaybeAddModal.ts](../../src/MaybeAddModal.ts); rendered by the Maybe sub-tab of `AirtimeTab` ([upcoming](upcoming.md)), not by `ListTab` |
| Community rating | [CommunityRating.ts](../../src/CommunityRating.ts) |
| TMDB collections | [CollectionModal.ts](../../src/CollectionModal.ts) (`resolveCollection`, `countMissing`) |
| Manual credits | [AddCreditModal.ts](../../src/AddCreditModal.ts) |
| Movie "Mark as Watched" | [MarkWatchedButton.ts](../../src/MarkWatchedButton.ts) (`isSingleEpisodeTitle`) |
| Shelf DOM helpers | [RowsView.ts](../../src/RowsView.ts) (`renderShelf`, `renderShelfTitle`; shelf logic stays in `ListTab`) |
| Poster fetch | `PosterService.enqueue(title, overwrite?)` in `src/PosterService.ts` (queue; result goes to `DataManager.updatePosterUrl`) |
| Note <-> `HoardTitle` mapping | [titleCodec.ts](../../src/storage/titleCodec.ts) (`decodeTitle`, `encodeTitle`, `splitCache`, `TITLE_CACHE_KEYS`) |

## How it works

**Read path.** `EntryIndex` decodes notes (properties via `decodeTitle`, merged with the `EntryCache` from data.json). `DataManager.getTitles()` hands out mutable copies (`viewOf`, one per id, `structuredClone`) of non-Maybe entries; `getTitle(id)` returns the same copy. Each copy carries a baseline (the stored state it was made from, `storage/baseline.ts`) so a stale copy only writes fields it changed itself. The `## Notes` body is held separately in `DataManager.notes` and re-read on vault modify/create events.

**Write path.** UI mutates the copy, then calls one of:
- `updateTitle(t)`: stamps `dateModified`, clears priority when `Completed`, logs rating/completion to history, `writeTitle`, notifies.
- `updateTitleSilent(t)` + `save()`: batch, written on `save()`.
- `scheduleEpisodeSave(id)` (500 ms debounce): used by `applyEpisodeWatchedToggle`, no notify; the caller updates its own DOM.
- Silent API backfills (`updatePosterUrl`, `updateCommunityRating`, `updateTrailerUrl`, `updateCredits`, `updateStudio`, `updateTmdbIdentity`): cache only, no `dateModified`, no note write (poster is the exception: it goes into the note's `poster` only when empty, or with `overwrite`).
- `updateManualCredits`, `setFavorite`, group ops (`setTitleGroups`): note write, no `dateModified` stamp.

`writeTitle` renames the file on title/type change, then diffs `encodeTitle(baseline)` against `encodeTitle(t)` and sets only changed properties via `processFrontMatter`, then writes the `## Notes` section if changed. `afterWrite` updates the cache (`syncCache` using `splitCache`) and applies the decoded result to the index optimistically before Obsidian's change event. Every notify dispatches `hoard-data-changed`; `ListTab` is re-rendered by the view (see [overview](../architecture/overview.md)). Details: [entry-write](../flows/entry-write.md), [entry-cache](../concepts/entry-cache.md).

**What lives where.** API-derived fields (poster, trailer, director/cast/studio, community rating, collection id, tmdb id, mal/anilist id, fetched seasons) are device-local cache, not note properties (`TITLE_CACHE_KEYS`). Exceptions that land in the note: user overrides (`manualTrailerUrl`, manual credits, a poster typed in `EditTitleModal`), and seasons once edited or when the title has no fetchable identity (`seasonsOverride`). Details of the split: [shared-vs-local](../concepts/shared-vs-local.md).

**Adding.** `ListTab.openAddTitleChooser` -> choice modal -> URL (IMDb via `getTmdbByImdbId`/`getOmdbByImdbId` by `activeApi`; TMDB URL needs a key) or manual/API search. Both end in `AddTitleModal`, which fills a `HoardTitle`, blocks duplicate names (case-insensitive), calls `DataManager.addTitle` (`insertNote`: creates the note, or takes over a Maybe note at the same path), fire-and-forget fetches the community rating, then assigns the group. Future full `releaseDate` forces status `To be released` (-> Upcoming). See [add-title](../flows/add-title.md).

**Seasons and episodes.** `watchedEpisodes` is a flat list of episode numbers across seasons; `totalEpisodes` minus per-season skipped = effective total. Season data missing for a series with an API identity is refilled in the background (`queueMissingSeasons` / `refillSeasons`, shared throttled `apiQueue`, per-outcome retry TTLs); episode toggles show a notice and wait while seasons are pending. Auto-complete/un-complete follows settings (`autoCompleteOnLastEpisode`, `setFinishDateAutomatically`). Season text format in the edit form: `Season 1: 12 (5,8,33-37)`; see [episode-range](../concepts/episode-range.md).

**Groups** are derived: a group is the set of titles sharing a name in their `groups` property; id = name. Add/rename/remove rewrite members' properties. Pinned group and saved filter preset are device-local UI state. `ListTab.getDisplayItems` builds `DisplayItem`s (title or group + members): grouped titles are hidden at top level, a group shows if any member passes search/filters.

**Maybe titles** are title notes with `maybe: true`, excluded from `getTitles`/`getGroups`/poster+season queues; `getMaybeTitles`, `addMaybeTitle`, `removeMaybeTitle` (provisional id replaced by the note path). See [maybe-title](../concepts/maybe-title.md).

**Credits.** Detail modal backfills director/cast (`maybeBackfillCredits`) and studio (`maybeBackfillStudio`) once per open for absent fields; a miss stores a `'none'` marker so it is not retried. Shown credits = fetched merged with manual (`getTitleCredits`). `AddCreditModal` replaces the whole manual array.

**Community rating.** `CommunityRating.ts`: badge, manual refresh (anime without the preferred source's id searches by name and writes id + `externalLink`), background refresh when older than 30 days and a fetchable source exists. Writes via `updateCommunityRating` (cache).

**Collections.** Movies only. `resolveCollection`: cached collection id, else TMDB id / IMDb id lookup / title search, caching the verdict (`COLLECTION_NONE`) via `updateTmdbIdentity`. The detail footer shows a button only for collections with 2+ parts; `CollectionModal` batch-adds missing parts (`addTitleBatch`) and can create a group.

## Where to change what

- New/changed property on a title: `HoardTitle` in `src/types.ts`, `titleCodec.ts` (encode/decode, `TITLE_KEYS` in `DataManager`, cache split if API-derived).
- Write behaviour, stamps, history lines, auto-complete: `DataManager`.
- Filters, sort, shelves, row/accordion rendering: `ListTab` (shelf ids in `ROWS_SHELVES`, `types.ts`).
- Detail modal sections: `TitleDetailModal`; edit form fields and seasons parsing: `EditTitleModal`.
- Add flow fields / duplicate handling: `AddTitleModal`; URL parsing: `AddFromUrlModal`.
- Poster/trailer/rating/credits fetch rules: `PosterService`, `CommunityRating`, `ApiService`.

## Links

[storage](../architecture/storage.md), [overview](../architecture/overview.md), [entry-id](../concepts/entry-id.md), [entry-cache](../concepts/entry-cache.md), [maybe-title](../concepts/maybe-title.md), [add-title](../flows/add-title.md), [entry-write](../flows/entry-write.md), [upcoming](upcoming.md), [drafts](drafts.md), [custom-lists](custom-lists.md)
