---
type: Module
title: Upcoming
description: What the Upcoming tab (src/modules/airtime) shows, how it decides aired versus due, what a tick and a removal write, and how schedules are added.
source:
  - src/modules/airtime/exports.ts
  - src/modules/airtime/domain/model.ts
  - src/modules/airtime/services/roles.ts
  - src/modules/airtime/domain/airtime.ts
  - src/modules/airtime/domain/schedulePatch.ts
  - src/modules/airtime/ui/AirtimeTab.ts
  - src/modules/airtime/ui/AirtimeScheduleModal.ts
  - src/modules/airtime/ui/ScheduleForm.ts
  - src/modules/airtime/ui/ReadingScheduleModal.ts
  - src/modules/airtime/ui/GameScheduleModal.ts
  - src/modules/airtime/ui/UpcomingFinderModal.ts
  - src/modules/airtime/services/airtimeScheduler.ts
  - src/app/wiring/airtime.ts
  - src/modules/watchlist/services/DataManager.ts
source_commit: 5f7a103
---

# Upcoming

The module is `src/modules/airtime`; the tab `AirtimeTab` ([AirtimeTab.ts](../../src/modules/airtime/ui/AirtimeTab.ts)) has
no store: every row is an `AirtimeEntry` computed by `getAirtimeEntries()` (the `AirtimeReader` role, `AirtimeStore` extends it; both implemented by
the watchlist's `DataManager`) from note properties, see [airtime](../concepts/airtime.md) for manual versus derived
entries and the writes. [exports.ts](../../src/modules/airtime/exports.ts) is the public surface (only named re-exports): the types (`domain/model.ts`) `AirtimeEntry`,
`AirtimeSchedule`, `EntryAirtime`, `AirtimeRecurrence`, the roles (`services/roles.ts`) `AirtimeReader` (`getAirtimeEntries`, `refreshAiring`; used by widgets and the scheduler) and `AirtimeStore`
(the writes), and the value `toEntryAirtime` (`domain/airtime.ts`). Changes to `exports.ts` go through the `exports-reviewer` agent (`.claude/agents/exports-reviewer.md`) before they are committed. The tab types against roles (`TitleReader & AirtimeStore`, `ReadingReader & ReadingWriter`,
`GameReader & GameWriter`); [wiring/airtime.ts](../../src/app/wiring/airtime.ts) `new`s the tab and the dialogs and exposes
`countDue` for the tab badge. Notifications and the status bar are in
[flows/airtime-notifications](../flows/airtime-notifications.md); the scheduler tick is `runAirtimeScheduler` in
[airtimeScheduler.ts](../../src/modules/airtime/services/airtimeScheduler.ts).

## Inner tabs

- **tracker** (default): List rows or Cards grouped by month, virtualised; view in
  `settings.upcomingTrackerView`.
- **history**: titles whose `releaseDate` lies in the last six months, read from `getTitles()`,
  no airtime entries involved.
- **maybe**: `getMaybeTitles()` sorted by release date; the add button opens the [add wizard](add.md) with `target: 'maybe'`
  (anime, series and movie only; [maybe title](../concepts/maybe-title.md)).

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
  episode. It also calls the host's `markAirtimeHandled` so the scheduler does not notify again.
- Removal rules (`removeAirtimeEntriesBatch`): a manual schedule drops only its `airtime*`
  keys, a derived card clears the release date through the owning manager, which then applies
  its release-status rule.

## Adding and editing

"+ Add" opens `UpcomingFinderModal` (fuzzy finder over titles, books, manga and games not yet
tracked), then the schedule modal by source: [AirtimeScheduleModal.ts](../../src/modules/airtime/ui/AirtimeScheduleModal.ts) (
single or recurring, optional time), [ReadingScheduleModal.ts](../../src/modules/airtime/ui/ReadingScheduleModal.ts)
(no time, volume and chapter counters), [GameScheduleModal.ts](../../src/modules/airtime/ui/GameScheduleModal.ts)
(date only, also sets the game's `releaseDate`, future dates only). Shared form state and
recurrence options live in [ScheduleForm.ts](../../src/modules/airtime/ui/ScheduleForm.ts); the schedule line text is `scheduleText.ts` in the same folder.

## Where to change what

| Change | Place |
|---|---|
| Countdown, aired and due rules | `getDetailedCountdown`, `isAirtimePassedNow` in `AirtimeTab.ts` |
| What becomes an entry | `airtimeEntryOf`, `isAwaitingRelease` in the watchlist `DataManager.ts` |
| Tick and remove | `confirmTick`; `tickAirtimeEntry`, `removeAirtimeEntriesBatch` |
| Schedule form fields | `ScheduleForm.ts` and the three schedule modals |
| What a reading schedule writes back to the item (totals, future `once` release date) | `readingSchedulePatch` in [schedulePatch.ts](../../src/modules/airtime/domain/schedulePatch.ts); `applyReadingPatch` in `AirtimeTab.ts` applies it |
| Card and list rendering | `renderCard`, `buildTrackerCard`, `renderTrackerCardsGrid` |
