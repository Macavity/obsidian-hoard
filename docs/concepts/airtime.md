---
type: Domain
title: Airtime
description: The airtime* note properties, AirtimeEntry versus derived release cards, and the acknowledgement rule.
source:
  - src/modules/airtime/exports/index.ts
  - src/shared/storage/titleCodec.ts
  - src/shared/storage/readingCodec.ts
  - src/modules/watchlist/services/DataManager.ts
  - src/modules/airtime/services/airtimeScheduler.ts
source_commit: 4c5ff3ab895535b09f6d6ba5a885a7bf887ffb16
---

# Airtime

Two things feed the Upcoming tab:

1. **A manual schedule** stored on the entry's note as `Airtime Recurrence` (`once | daily | weekly |
   monthly`), `Airtime Day`, `Airtime Time`, `Airtime Season`, `Airtime Episode`, `Airtime Acknowledged`.
   Decoded into `EntryAirtime` ([airtime/exports](../../src/modules/airtime/exports/index.ts)) by the codecs (titles in [titleCodec](../../src/shared/storage/titleCodec.ts),
   reading and games via `decodeAirtime` in [readingCodec](../../src/shared/storage/readingCodec.ts)).
   The two disagree on empty values: a title keeps an empty `Airtime Time` as a value and reports
   an empty `Airtime Recurrence` as invalid; reading and games read both as not set.
   A `once` schedule keeps its date in the note's `Release Date`.
2. **A derived card** for any entry whose status is "To be released" with a release date; no
   airtime keys exist for it.

`DataManager.getAirtimeEntries()` (role `AirtimeStore`) turns both into `AirtimeEntry` objects (`source`: watchlist, reading
or game; `schedule` with recurrence, day, time, release date). The entry id is generated per source
(`generateAirtimeId`, `generateReadingAirtimeId`, `generateGameAirtimeId`).

## Rules in DataManager

- `removeAirtimeEntriesBatch`: removing a manual schedule drops only the airtime keys, so a
  "To be released" item falls back to its derived card; removing a derived card clears the release
  date, and the status follows the release-date rules (`applyReleaseDateChange`).
- `tickAirtimeEntry` records the acknowledgement so the countdown resets; without an API pointer
  it also advances the note's season/episode, with one the API moves the pointer.
- `refreshAiring` reloads the API airing pointer (TMDB or AniList) into the
  [entry cache](entry-cache.md) through the throttled queue; `isAiringTracked` says whether the
  shown pointer comes from the cache rather than the note. `writeAirtime` is the single note writer.

## Scheduler

[airtimeScheduler.ts](../../src/modules/airtime/services/airtimeScheduler.ts) runs once a minute (`main.ts` interval): an entry notifies once per
day on the first tick at or after its `HH:MM`, within a 12-hour catch-up window; recurring watch
schedules get their airing pointer refreshed (forced on the notifying tick). It never writes a note.
See [flows/airtime-notifications](../flows/airtime-notifications.md).
