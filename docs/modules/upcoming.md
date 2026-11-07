---
type: Module
title: Upcoming
description: How the Upcoming tab (airtime tracker) derives its entries, counts what is due, notifies and writes schedules back to notes; where to change each part.
source:
  - src/AirtimeTab.ts
  - src/airtimeScheduler.ts
  - src/DataManager.ts
  - src/main.ts
  - src/ui/ScheduleForm.ts
  - src/ReadingScheduleModal.ts
  - src/GameScheduleModal.ts
  - src/UpcomingFinderModal.ts
  - src/types.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Upcoming

## Purpose / Boundary

Tracks what releases next: watch titles (episodes), Books/Manga (chapters) and Games (single release). The tab is `AirtimeTab` (tab id `upcoming`); it has no store of its own. Everything is derived from notes by `DataManager`. Concept background: [airtime](../concepts/airtime.md). Notification pipeline: [airtime notifications](../flows/airtime-notifications.md). Storage model: [storage](../architecture/storage.md).

## Entry points

- `AirtimeTab` ([AirtimeTab.ts](../../src/AirtimeTab.ts)): `render()` with three inner tabs: `tracker` (default), `history`, `maybe`.
  - `tracker`: List rows or Cards grid (month-grouped, virtualised). View stored in `settings.upcomingTrackerView`.
  - `history`: titles with `releaseDate` in the last 6 months up to today (read from `getTitles()`, no airtime entries).
  - `maybe`: `getMaybeTitles()` sorted by release date; add via `MaybeAddModal`.
- Static, render-free counters: `AirtimeTab.getAiredDueCount(...)`, `AirtimeTab.getMaybeDueCount(dm)` (Maybe titles with `releaseDate <= today`).
- `runAirtimeScheduler` ([airtimeScheduler.ts](../../src/airtimeScheduler.ts)), called by `HoardPlugin.checkAirtimeNotifications` in [main.ts](../../src/main.ts).

## How it works

### What an AirtimeEntry is
`AirtimeEntry` (in [types.ts](../../src/types.ts)) is a computed view, one per note, never persisted as such. `DataManager.getAirtimeEntries()` walks non-Maybe titles, books, manga and games; `airtimeEntryOf` builds each:

- Manual schedule: the note has `airtime*` properties (`airtimeRecurrence/Day/Time/Season/Episode/Acknowledged`, see `AIRTIME_KEYS`). `scheduleOf` maps them to an `AirtimeSchedule`. For `once` the date is the note's `releaseDate`, not an airtime property.
- Derived: no `airtime*` properties, but the entry is awaiting release (`isAwaitingRelease`: titles need status "To be released" plus a `releaseDate`; reading/games also count a future `releaseDate`). Yields a `once` schedule with that date.
- Otherwise no entry.
- Ids are generated per source (`generateAirtimeId` / `generateReadingAirtimeId` / `generateGameAirtimeId`). `source` is absent or `watchlist`, `reading` (with `readingKind`) or `game`. Reading reuses `currentSeason`/`currentEpisode`/`totalEpisodes` for volume/chapter/total chapters.
- API pointer: for a recurring watch schedule, the cached `airing.nextEpisode`/`nextSeason` (from EntryCache) overrides the note's episode (`airingOf`, `isAiringTracked`).

### Countdown and due counts
`getDetailedCountdown` (module-private in AirtimeTab.ts) yields kind `future | today-before | aired | due` plus label. `once` in the past (or today after `releaseTime`; no time = whole day counts) is `due` for single releases, `aired` otherwise. Recurring daily/weekly/monthly: `lastAcknowledgedDate === today` pushes the next occurrence (tomorrow / +7 days / next month). `getAiredDueCount` counts entries of kind `aired`/`due`, skipping orphans (missing title/item), with the same `isSingle = recurrence === 'once'` rule as `resolveEntry`. Card sort: aired/due, then today, then future by days.

### Ticking and removing
`confirmTick` in AirtimeTab: single release (`once`) -> remove entry and revert status to plan status (`revertToBeReleasedStatus`); final unit (`currentEpisode >= totalUnits`) -> remove, status unchanged; otherwise `DataManager.tickAirtimeEntry(entry, today)`: with an API pointer it only writes `airtimeAcknowledged`, else it also increments the episode. It also calls `plugin.markAirtimeHandled("<entryId>-<date>")` so the scheduler does not notify again.
`removeAirtimeEntriesBatch`: a manual schedule drops only its `airtime*` keys (release date stays, so a "To be released" item falls back to a derived card); a derived entry clears the release date via the owning manager. Writes go through `writeAirtime` (titles via `writeTitle`, others `processFrontMatter` with only these keys).

### Scheduler, notifications, status bar
`startAirtimeScheduler` runs once at load and every 60 s. Per entry: fire when today matches the schedule (`isScheduledForToday`), `releaseTime` has passed (at most 12 h ago, catch-up), and `<id>-<yyyy-mm-dd>` is not yet in `notifiedEntries`. Fire = `new Notice(name, 8000)`. It never writes notes. For recurring watch entries it also calls `DataManager.refreshAiring(titleId, force=fire)`: API refresh into the cache via the shared api queue, throttled by `apiCheckDue` (TTLs 6 h ok / 1 h transient / 7 d not found), never writes the note.
Status bar (desktop only, `setupStatusBar`/`updateStatusBar`): `getAiredDueCount + getMaybeDueCount`, shown as "N due", hidden at 0 or when `settings.showUpcomingStatusBar` is off; refreshed every scheduler tick and on `hoard-data-changed`. Click opens the Upcoming view. The tab itself reports the same sum through `onCountChange` (tab badge).

### Add / edit flow
"+ Add" -> `UpcomingFinderModal` (fuzzy finder over watch titles, books, manga, games not yet tracked) -> schedule modal by source: `AirtimeScheduleModal` (class inside AirtimeTab.ts, watch; Single/Recurring toggle, optional time), [ReadingScheduleModal.ts](../../src/ReadingScheduleModal.ts) (no time; volume/chapter counters), [GameScheduleModal.ts](../../src/GameScheduleModal.ts) (date only; saving also sets the game's `releaseDate`, future dates only via `syncGameFromSchedule`). Shared form logic: [ScheduleForm.ts](../../src/ui/ScheduleForm.ts) (`renderScheduleModal`, `buildScheduleFromState`, `initialScheduleState`, `RECURRENCE_OPTIONS`). Recurrences: `once | daily | weekly | monthly`.

## Where to change what

| Change | Place |
|---|---|
| Countdown / aired / due rules | `getDetailedCountdown`, `isAirtimePassedNow` in AirtimeTab.ts (also feeds counts) |
| What becomes an entry, derived vs manual | `airtimeEntryOf`, `isAwaitingRelease` in DataManager.ts |
| Note property names / encoding | `AIRTIME_KEYS`, `toEntryAirtime`, `scheduleOf`, `encodeAirtime` (codec) |
| Tick / remove behaviour | `confirmTick`, `tickAirtimeEntry`, `removeAirtimeEntriesBatch` |
| Notification timing, dedup, catch-up window | `runAirtimeScheduler`, `AIRTIME_CATCH_UP_MINUTES` |
| API airing refresh cadence | `refreshAiring`, `API_CHECK_TTL_MS` |
| Status bar / due badge | `updateStatusBar` in main.ts, `getAiredDueCount` |
| Schedule form fields | ScheduleForm.ts + the three schedule modals |
| Card/List rendering | `renderCard` (list), `buildTrackerCard` / `renderTrackerCardsGrid` (cards); see [ui-kit](../architecture/ui-kit.md) |

## Links
[airtime concept](../concepts/airtime.md), [airtime notifications flow](../flows/airtime-notifications.md), [storage](../architecture/storage.md), [ui-kit](../architecture/ui-kit.md).
