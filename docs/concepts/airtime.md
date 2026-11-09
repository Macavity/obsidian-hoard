---
type: Domain
title: Airtime
description: The airtime* note properties, AirtimeEntry versus derived release cards, and the acknowledgement rule.
source:
  - src/types.ts
  - src/storage/titleCodec.ts
  - src/storage/readingCodec.ts
  - src/DataManager.ts
  - src/airtimeScheduler.ts
source_commit: c835bfb530da4775fa4668bc69029e9896b570e8
---

# Airtime

Two things feed the Upcoming tab:

1. **A manual schedule** stored on the entry's note as `airtimeRecurrence` (`once | daily | weekly |
   monthly`), `airtimeDay`, `airtimeTime`, `airtimeSeason`, `airtimeEpisode`, `airtimeAcknowledged`.
   Decoded into `EntryAirtime` by the codecs (titles in [titleCodec](../../src/storage/titleCodec.ts),
   reading and games via `decodeAirtime` in [readingCodec](../../src/storage/readingCodec.ts)).
   A `once` schedule keeps its date in the note's `releaseDate`.
2. **A derived card** for any entry whose status is "To be released" with a release date; no
   airtime keys exist for it.

`DataManager.getAirtimeEntries()` turns both into `AirtimeEntry` objects (`source`: watch, reading
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

[airtimeScheduler.ts](../../src/airtimeScheduler.ts) runs once a minute: an entry notifies once per
day on the first tick at or after its `HH:MM`, within a 12-hour catch-up window; recurring watch
schedules get their airing pointer refreshed (forced on the notifying tick). It never writes a note.
See [flows/airtime-notifications](../flows/airtime-notifications.md).
