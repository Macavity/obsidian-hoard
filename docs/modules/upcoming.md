---
type: Module
title: Upcoming
description: What the Upcoming tab shows, how it decides aired versus due, what a tick and a removal write, and how schedules are added.
source:
  - src/AirtimeTab.ts
  - src/DataManager.ts
  - src/ui/ScheduleForm.ts
  - src/ReadingScheduleModal.ts
  - src/GameScheduleModal.ts
  - src/UpcomingFinderModal.ts
  - src/types.ts
source_commit: 89be701597836592a0ea6243d561604a1a62bc5f
---

# Upcoming

The tab `AirtimeTab` ([AirtimeTab.ts](../../src/AirtimeTab.ts)) has no store: every row is an
`AirtimeEntry` computed by `DataManager.getAirtimeEntries()` from note properties, see
[airtime](../concepts/airtime.md) for manual versus derived entries and the writes. Notifications
and the status bar are in [flows/airtime-notifications](../flows/airtime-notifications.md).

## Inner tabs

- **tracker** (default): List rows or Cards grouped by month, virtualised; view in
  `settings.upcomingTrackerView`.
- **history**: titles whose `releaseDate` lies in the last six months, read from `getTitles()`,
  no airtime entries involved.
- **maybe**: `getMaybeTitles()` sorted by release date; add via `MaybeAddModal`
  ([maybe title](../concepts/maybe-title.md)).

## Aired versus due

`getDetailedCountdown` yields `future | today-before | aired | due`. A `once` entry whose date is
past (or today after its time; without a time the whole day counts) is **due** for single
releases and **aired** otherwise. Recurring entries acknowledged today push to the next occurrence
(tomorrow, +7 days, next month). `getAiredDueCount` counts aired and due entries and skips
orphans whose title or item is gone; it is static so the badge and status bar can call it without
the tab being open. Cards sort aired/due, then today, then future by days. For recurring watch
entries the cached API pointer (`airing.nextSeason/nextEpisode`) overrides the note's episode.

## Tick and remove

- `confirmTick`: a single release removes the entry and reverts the status to the plan status;
  the final unit (`currentEpisode >= totalUnits`) removes the entry and leaves the status; otherwise
  `tickAirtimeEntry` writes `airtimeAcknowledged` and, without an API pointer, increments the
  episode. It also calls `plugin.markAirtimeHandled` so the scheduler does not notify again.
- Removal rules (`removeAirtimeEntriesBatch`): a manual schedule drops only its `airtime*`
  keys, a derived card clears the release date through the owning manager, which then applies
  its release-status rule.

## Adding and editing

"+ Add" opens `UpcomingFinderModal` (fuzzy finder over titles, books, manga and games not yet
tracked), then the schedule modal by source: `AirtimeScheduleModal` (inside `AirtimeTab.ts`:
single or recurring, optional time), [ReadingScheduleModal.ts](../../src/ReadingScheduleModal.ts)
(no time, volume and chapter counters), [GameScheduleModal.ts](../../src/GameScheduleModal.ts)
(date only, also sets the game's `releaseDate`, future dates only). Shared form state and
recurrence options live in [ScheduleForm.ts](../../src/ui/ScheduleForm.ts).

## Where to change what

| Change | Place |
|---|---|
| Countdown, aired and due rules | `getDetailedCountdown`, `isAirtimePassedNow` in `AirtimeTab.ts` |
| What becomes an entry | `airtimeEntryOf`, `isAwaitingRelease` in `DataManager.ts` |
| Tick and remove | `confirmTick`; `tickAirtimeEntry`, `removeAirtimeEntriesBatch` |
| Schedule form fields | `ScheduleForm.ts` and the three schedule modals |
| Card and list rendering | `renderCard`, `buildTrackerCard`, `renderTrackerCardsGrid` |
