---
type: Module
title: Watchlist
description: What the movies/TV/anime domain does, which file owns which behaviour, and the rules that are not obvious from one file.
source:
  - src/modules/watchlist/exports.ts
  - src/modules/watchlist/domain/model.ts
  - src/modules/watchlist/services/roles.ts
  - src/modules/watchlist/domain/newTitle.ts
  - src/modules/watchlist/domain/seasonText.ts
  - src/modules/watchlist/domain/completedEpisodes.ts
  - src/modules/watchlist/domain/seasonFormat.ts
  - src/modules/watchlist/services/DataManager.ts
  - src/modules/watchlist/domain/titleHelpers.ts
  - src/modules/watchlist/ui/ListTab.ts
  - src/modules/watchlist/ui/TitleDetailModal.ts
  - src/modules/watchlist/ui/EditTitleModal.ts
  - src/modules/watchlist/ui/collectionModel.ts
  - src/modules/watchlist/ui/CommunityRating.ts
  - src/shared/domain/filterCriteria.ts
  - src/design-system/rowWindow.ts
  - src/modules/watchlist/ui/CollectionModal.ts
  - src/app/wiring/watchlist.ts
  - src/modules/watchlist/ui/watchlistAddProvider.ts
  - src/modules/watchlist/ui/TitleAddForm.ts
  - src/modules/watchlist/ui/titleUrl.ts
  - src/shared/storage/titleCodec.ts
  - src/shared/domain/sourceType.ts
source_commit: 5f7a103
---

# Watchlist

Titles carrying a user-defined `Type` label (also their folder) and a `Source Type` (`Anime` | `Movie` | `Series`, `shared/domain/sourceType.ts`) that is their kind: status, priority, rating, review, notes,
seasons with watched and skipped episodes, groups, favourites, release date, plus cached API data
(poster, trailer, credits, studio, community rating, TMDB collection). One note per title. Not
here: the Upcoming UI ([upcoming](upcoming.md)), books and games, the API clients.

## Public face

[exports.ts](../../src/modules/watchlist/exports.ts) is the public surface (what other modules and `shared` may import); it only re-exports by name: the models (`domain/model.ts`) `HoardTitle`, `Season`, `MaybeTitle`,
`HoardGroup`, the search and TMDB shapes, `OpenCsv`, the role interfaces (`services/roles.ts`) of this module `DataManager` `implements`:
`TitleReader`, `TitleStats`, `TitleWriter`, `TitleMaintenance` (settings) and `TitleBackup` ([backup](backup.md)), and pure values: `newTitle`
(`domain/newTitle.ts`), `parseSeasonLine` / `seasonsOf` (`domain/seasonText.ts`), `getTitleCredits`, `getDisplayPoster`,
`isCreditsUnfetched` (`domain/titles.ts`). Kind decisions (API routing, movie behaviour, anime handling, identity order in `titleCodec`) read `sourceType` via `shared/domain/sourceType.ts`; a title without one gets no API lookups, behaves like a series and does not fall back to `Type`. CSV import maps an optional Source Type column (invalid values stay absent); collection parts are written with `Source Type: Movie`. `DataManager` also implements `AirtimeStore` ([airtime `exports.ts`](upcoming.md), the Upcoming schedule of every medium) and
`DraftStore` ([drafts `exports.ts`](drafts.md)); `AirtimeReader` is its read half. Changes to `exports.ts` go through the `exports-reviewer` agent (`.claude/agents/exports-reviewer.md`) before they are committed. Other modules take these roles or `Pick`s of
them, never the class; [wiring/watchlist.ts](../../src/app/wiring/watchlist.ts) is the only place that `new`s the
dialogs and `ListTab`. Pure, module-only helpers (collection verdict, manual credits, community rating and trailer
display) are in `domain/titleHelpers.ts`.

## Who owns what

| Behaviour | Owner |
|---|---|
| State, every note write, groups, Maybe, episode toggles, API backfills, history lines | [DataManager.ts](../../src/modules/watchlist/services/DataManager.ts) |
| Tab: Rows shelves or List table, filters, sort, selection, group display | [ListTab.ts](../../src/modules/watchlist/ui/ListTab.ts) (filter rules: `passesCommonFilters` in [filterCriteria.ts](../../src/shared/domain/filterCriteria.ts); List-view row offsets and visible range: `rowOffsets`, `visibleRowRange` in [rowWindow.ts](../../src/design-system/rowWindow.ts)); shelf DOM in [RowsView.ts](../../src/design-system/RowsView.ts), shelf ids in `ROWS_SHELVES` (`shared/domain/rows.ts`) |
| Detail modal: episodes, rating, credits, studio, trailer, collection button; `GroupDetailModal` | [TitleDetailModal.ts](../../src/modules/watchlist/ui/TitleDetailModal.ts) |
| Edit form: title, type, episodes, link, poster and trailer override, seasons text, group | [EditTitleModal.ts](../../src/modules/watchlist/ui/EditTitleModal.ts); the seasons text format: parse in [seasonText.ts](../../src/modules/watchlist/domain/seasonText.ts), format in `domain/seasonFormat.ts`; the per-episode grid is `EpisodeGrid.ts` (`ui/`) ([episode range](../concepts/episode-range.md)) |
| Add: the watchlist's `AddProvider` ([watchlistAddProvider.ts](../../src/modules/watchlist/ui/watchlistAddProvider.ts): search, pasted-link resolution in `titleUrl.ts`) and its form ([TitleAddForm.ts](../../src/modules/watchlist/ui/TitleAddForm.ts)); the dialog is the [add wizard](add.md), which Drafts and Custom Lists open with a query | see [flows/add-title](../flows/add-title.md) |
| Maybe titles: added through the same wizard (`target: 'maybe'`, opened from the Upcoming tab; `TitleAddForm` writes the Maybe note), listed by the Maybe sub-tab of Upcoming, never by `ListTab` | [maybe title](../concepts/maybe-title.md) |
| Community rating badge, manual and 30-day background refresh; `RatingRefreshOutcome` is how a manual refresh ended and `ratingRefreshNotice` maps it to the notice text | [CommunityRating.ts](../../src/modules/watchlist/ui/CommunityRating.ts) |
| TMDB collections: resolve, count missing parts, batch-add | [CollectionModal.ts](../../src/modules/watchlist/ui/CollectionModal.ts); the pure part (card specs for added / missing parts, default status and priority, id dedupe, result notice) in [collectionModel.ts](../../src/modules/watchlist/ui/collectionModel.ts) |
| Manual credits, movie "Mark as watched" | `AddCreditModal.ts`, `MarkWatchedButton.ts` |
| Note ↔ `HoardTitle`, cache split | [titleCodec.ts](../../src/shared/storage/titleCodec.ts) |
| Defaults of a new title (add, collection, CSV, Maybe); a Completed title has every episode ticked | `newTitle` in [domain/newTitle.ts](../../src/modules/watchlist/domain/newTitle.ts), `completedEpisodes` in [domain/completedEpisodes.ts](../../src/modules/watchlist/domain/completedEpisodes.ts) |

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

A title property: `HoardTitle` in `domain/model.ts`, encode/decode in `titleCodec.ts`, `TITLE_CACHE_KEYS`
if it is API data. Write behaviour and history wording: `DataManager`. Everything visible: the
owner table above.
