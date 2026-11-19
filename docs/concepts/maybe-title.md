---
type: Domain
title: Maybe title
description: What a Maybe note is, how it differs from a library title, and how it is promoted.
source:
  - src/modules/watchlist/contract.ts
  - src/shared/storage/titleCodec.ts
  - src/modules/watchlist/services/DataManager.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Maybe title

A **Maybe** is a title the user is considering but has not added to the library: a note in the
same type folder with the property `Maybe: true`. It is decoded like any title
([titleCodec](../../src/shared/storage/titleCodec.ts) sets `title.maybe`), but
`DataManager.getTitles()` excludes it; `getMaybeTitles()` lists Maybe notes as `MaybeTitle`
([types.ts](../../src/modules/watchlist/contract.ts)).

- `addMaybeTitle` creates the note (id = note path), `removeMaybeTitle` trashes it.
- **Promotion**: `addTitle` for a title whose note path already holds a Maybe note takes that note
  over (`insertNote`): same file, `Maybe` dropped, fields from the new title, and its `## Notes`
  body survives when the new title brings none.
- The UI for Maybe titles is the Maybe sub-tab of the Upcoming tab, not the Watchlist
  ([modules/upcoming](../modules/upcoming.md), [modules/watchlist](../modules/watchlist.md)).
  Maybe titles with a release date count towards the Upcoming badge via `AirtimeTab.getMaybeDueCount`.
- Backups carry them separately under `entries.maybe` ([modules/backup](../modules/backup.md)).
