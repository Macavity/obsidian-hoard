---
type: Flow
title: Add title
description: From the Add modal's search box to a new note, including API routing, the in-library marker and the duplicate guard.
source:
  - src/AddTitleModal.ts
  - src/ui/SearchFormModal.ts
  - src/ui/DuplicateGuard.ts
  - src/titleSearch.ts
  - src/apiSources.ts
  - src/LibraryIndex.ts
  - src/DataManager.ts
  - src/entryFactories.ts
source_commit: 554c087c9f4c7b4932c8b73a5b761c39fcc6846d
---

# Add title

Trigger: the `add-title` command, the Watchlist toolbar, a Drafts or Custom Lists row
(`AddRouter`), or a pasted URL (`AddFromUrlModal`). Book, manga and game adds share the same
skeleton with their own modals ([reading](../modules/reading.md), [games](../modules/games.md)).

```mermaid
sequenceDiagram
  participant M as AddTitleModal
  participant P as SearchPicker
  participant TS as titleSearch
  participant API as ApiService
  participant LI as LibraryIndex
  participant DM as DataManager
  M->>P: mount, search(initialQuery)
  P->>TS: searchTitles(type, query, year)
  TS->>API: searchAnime / searchAniList / searchCinemeta / searchOmdb / searchTmdb
  API-->>P: results
  P->>LI: lookup(idKeys, title) per row → "In library" marker
  P->>M: selectResult → resolvePick (details, seasons, trailer, credits)
  M->>M: renderForm with prefilled fields
  M->>DM: addTitle(entry) after blockDuplicate
  DM-->>M: note created, notify; onAdded(entry)
```

## Steps

1. **Skeleton**: `SearchFormModal` ([ui/SearchFormModal.ts](../../src/ui/SearchFormModal.ts))
   mounts a `SearchPicker` above a form and asks the subclass for picker options, `search`,
   `noApiMessage`, `renderResult`, `selectResult`, `renderForm`. A prefilled query searches at once.
2. **Routing**: `searchTitles` ([titleSearch.ts](../../src/titleSearch.ts)) maps the selected type
   through `typeApiMapping` to anime (Jikan or AniList) or movie/series, where
   `effectiveMediaSource` ([apiSources.ts](../../src/apiSources.ts)) picks Cinemeta, OMDb or TMDB:
   the chosen one if keyed, else keyless Cinemeta, so Movie and TV Show always search. The "No API
   configured" panel (`noApiMessage`) now only shows for a custom type with no entry in
   `typeApiMapping`. The default type comes from `resolveDefaultAddType`.
3. **In-library marker**: on the first search the modal builds a `LibraryIndex` over the watchlist;
   each result row asks `lookup(resultIdKeys(result), title)`. Matching is exact by
   [external id](../concepts/external-id.md) first, normalised title second, deliberately not fuzzy.
4. **Pick**: `resolvePick` fetches details for the chosen row (seasons, trailer, director, cast,
   studio, anime ids) through the same effective source, with an `isCurrent` guard so a stale
   response is dropped; `applyPick` fills the media fields and the form re-renders. Under Cinemeta
   the pick also carries the row's poster (`posterUrl`), which lands in the new note; OMDb and TMDB
   picks leave it empty and the poster queue fills it later ([api layer](../architecture/api-layer.md)).
   A pasted IMDb link (`AddFromUrlModal`) resolves the same way and opens this modal prefilled,
   without a poster.
5. **Submit**: `addTitle` requires a name, then `blockDuplicate`
   ([ui/DuplicateGuard.ts](../../src/ui/DuplicateGuard.ts)) warns on a same-name title with
   Continue/Cancel (Continue lets the next attempt pass once). "To be released" is not selectable;
   it follows the release date. The entry comes from `newTitle`
   ([entryFactories.ts](../../src/entryFactories.ts)), which owns the defaults of a new title; the
   modal passes only its form fields. A `Completed` add marks all episodes watched
   (`completedEpisodes`) and may set the finish date.
6. **Write**: `DataManager.addTitle` creates the note (or takes over a
   [Maybe note](../concepts/maybe-title.md)), the id becomes the note path, history logs "added",
   and the view re-renders ([entry write](entry-write.md)). The type used is remembered as
   `lastAddedType`, a community rating is fetched in the background, and a chosen or new group is
   applied.
7. `onAdded(entry)` lets the caller open the detail modal (`openWatchlistAfterAdd`) or refresh a
   Drafts card.

Failure points: API errors (Cinemeta included) render in the results panel (`apiErrorMessage`); an invalid YAML file
at the target path makes the create fail with a Notice.
