---
type: Module
title: Watchlist
description: What the movies/TV/anime domain does, which file owns which behaviour, and the rules that are not obvious from one file.
source:
  - src/modules/watchlist/services/DataManager.ts
  - src/modules/watchlist/ui/ListTab.ts
  - src/modules/watchlist/ui/TitleDetailModal.ts
  - src/modules/watchlist/ui/EditTitleModal.ts
  - src/modules/watchlist/ui/AddTitleModal.ts
  - src/modules/watchlist/ui/AddFromUrlModal.ts
  - src/modules/watchlist/ui/CollectionModal.ts
  - src/modules/watchlist/ui/CommunityRating.ts
  - src/modules/airtime/ui/MaybeAddModal.ts
  - src/shared/storage/titleCodec.ts
  - src/shared/domain/entryFactories.ts
  - src/shared/api/lookup.ts
source_commit: 5ac1323c9eec908b3ce2098f3bb6dceb43656b07
---

# Watchlist

Titles of user-defined types (Movie, TV Show, Anime, …): status, priority, rating, review, notes,
seasons with watched and skipped episodes, groups, favourites, release date, plus cached API data
(poster, trailer, credits, studio, community rating, TMDB collection). One note per title. Not
here: the Upcoming UI ([upcoming](upcoming.md)), books and games, the API clients.

## Who owns what

| Behaviour | Owner |
|---|---|
| State, every note write, groups, Maybe, episode toggles, API backfills, history lines | [DataManager.ts](../../src/modules/watchlist/services/DataManager.ts) |
| Tab: Rows shelves or List table, filters, sort, selection, group display | [ListTab.ts](../../src/modules/watchlist/ui/ListTab.ts); shelf DOM in `RowsView.ts`, shelf ids in `ROWS_SHELVES` (`types.ts`) |
| Detail modal: episodes, rating, credits, studio, trailer, collection button; `GroupDetailModal` | [TitleDetailModal.ts](../../src/modules/watchlist/ui/TitleDetailModal.ts) |
| Edit form: title, type, episodes, link, poster and trailer override, seasons text, group | [EditTitleModal.ts](../../src/modules/watchlist/ui/EditTitleModal.ts); the seasons text format in [seasonText.ts](../../src/shared/domain/seasonText.ts) ([episode range](../concepts/episode-range.md)) |
| Add: choice modal → URL paste ([AddFromUrlModal.ts](../../src/modules/watchlist/ui/AddFromUrlModal.ts)) or search ([AddTitleModal.ts](../../src/modules/watchlist/ui/AddTitleModal.ts)); loose strings from Drafts and Custom Lists via `AddRouter.ts` | see [flows/add-title](../flows/add-title.md) |
| Maybe titles: modal [MaybeAddModal.ts](../../src/modules/airtime/ui/MaybeAddModal.ts), listed by the Maybe sub-tab of Upcoming, never by `ListTab` | [maybe title](../concepts/maybe-title.md) |
| Community rating badge, manual and 30-day background refresh | [CommunityRating.ts](../../src/modules/watchlist/ui/CommunityRating.ts) |
| TMDB collections: resolve, count missing parts, batch-add | [CollectionModal.ts](../../src/modules/watchlist/ui/CollectionModal.ts) |
| Manual credits, movie "Mark as watched" | `AddCreditModal.ts`, `MarkWatchedButton.ts` |
| Note ↔ `HoardTitle`, cache split | [titleCodec.ts](../../src/shared/storage/titleCodec.ts) |
| Defaults of a new title (add, collection, CSV, Maybe); a Completed title has every episode ticked | `newTitle`, `completedEpisodes` in [entryFactories.ts](../../src/shared/domain/entryFactories.ts) |

## Rules worth knowing

- **Copies and writes.** `getTitles()` hands out one mutable copy per id with a
  [baseline](../concepts/baseline.md); the write diff is in [flows/entry-write](../flows/entry-write.md).
  Variants: `updateTitle` (stamps `dateModified`, clears priority on Completed, logs rating and
  completion); `updateTitleSilent` + `save()` for batches; `scheduleEpisodeSave` (debounced, no
  notify, caller updates its own DOM); backfills `updateCommunityRating`, `updateTrailerUrl`,
  `updateCredits`, `updateStudio`, `updateTmdbIdentity` write the cache only, no `dateModified`;
  `updatePosterUrl` writes the note's `Cover` when it is empty (or on explicit refresh);
  `updateManualCredits`, `setFavorite` and group changes write the note without a
  `dateModified` stamp.
- **Note vs cache.** API fields are device-local cache ([entry cache](../concepts/entry-cache.md)).
  Into the note go user overrides (manual trailer, manual credits, a typed poster), the poster an
  API found when the note had none, and seasons once edited by hand or when the title has no
  fetchable identity (`seasonsOverride`).
- **Seasons.** A series with an API identity and no seasons is refilled in the background through
  the throttled queue; episode toggles show a notice and wait while the refill is pending.
  Auto-complete follows `autoCompleteOnLastEpisode` and `setFinishDateAutomatically`. Edit-form
  season text: `Season 1: 12 (5,8,33-37)` ([episode range](../concepts/episode-range.md)).
- **Groups are derived**: a group is the set of titles sharing a name in `groups`; its id is the
  name; add, rename and remove rewrite the members' notes. Grouped titles are hidden at the top
  level of the tab; a group shows when any member passes search and filters. Pinned group and
  saved filter preset are device-local UI state.
- **Release date.** A future full date forces status "To be released" and therefore an Upcoming
  card; a past or cleared date reverts a "To be released" title to "Plan to watch" and leaves any
  other status alone (`applyReleaseDateChange`).
- **Credits, trailer and studio** are backfilled when the detail modal opens, for absent fields only
  and only when the lookup is due (`lookupDue`): a miss is recorded as `notfound` (retried after 7 d),
  a failure as `transient` (after 1 h), a missing TMDB key as `nokey`; a found value is final
  ([entry cache](../concepts/entry-cache.md#fetch-state)). A WatchLog-era note with `Director: none` or
  `Trailer: none` displays as before: no names, no trailer. Shown credits are fetched merged with manual.
- **Collections** are movies only: the verdict (collection id or `COLLECTION_NONE`) is cached via
  `updateTmdbIdentity`; the detail footer shows the button only for 2+ parts.

## Where to change what

A title property: `HoardTitle` in `types.ts`, encode/decode in `titleCodec.ts`, `TITLE_CACHE_KEYS`
if it is API data. Write behaviour and history wording: `DataManager`. Everything visible: the
owner table above.
