---
type: Flow
title: Airtime notifications
description: How the once-a-minute scheduler turns schedules into notices, badge counts and the status bar counter.
source:
  - src/modules/airtime/services/airtimeScheduler.ts
  - src/app/main.ts
  - src/modules/watchlist/services/DataManager.ts
  - src/app/HoardView.ts
  - src/app/wiring/airtime.ts
  - src/app/wiring/tabs.ts
  - src/shared/services/changeSignal.ts
source_commit: 4c5ff3ab895535b09f6d6ba5a885a7bf887ffb16
---

# Airtime notifications

Trigger: `startAirtimeScheduler` in [main.ts](../../src/app/main.ts) runs one pass at load and every
60 s (`registerInterval`). The Upcoming tab can also tick an entry by hand and calls
`markAirtimeHandled` so the scheduler does not fire twice.

```mermaid
flowchart TD
  T[60 s tick] --> R[runAirtimeScheduler]
  R --> E[DataManager.getAirtimeEntries]
  E --> D{due now and scheduled today?}
  D -- recurring watch --> A[refreshAiring, forced when firing]
  D -- yes, not yet notified today --> N[Notice with the entry name]
  R --> SB[updateStatusBar: N due]
  N -.-> V[HoardView badge on data change]
```

## Steps

1. `runAirtimeScheduler(dataManager, readingDataManager, gameDataManager, notify, notified, now)` in
   [airtimeScheduler.ts](../../src/modules/airtime/services/airtimeScheduler.ts) walks every `AirtimeEntry`
   ([airtime](../concepts/airtime.md)); the entries come from `AirtimeReader.getAirtimeEntries` (implemented by DataManager).
2. **Due** = today's `HH:MM` has passed at most 12 hours ago (`AIRTIME_CATCH_UP_MINUTES`, catches a
   sleeping machine without a burst after a long sleep) and the recurrence matches today
   (`daily`, `weekly` by `dayOfWeek`, `monthly` by `dayOfMonth`, `once` by date).
3. The key `<entry id>-<YYYY-MM-DD>` in the in-memory `notifiedEntries` set makes each entry fire
   once per day; the set is not persisted.
4. Recurring watch schedules get `DataManager.refreshAiring(titleId, force)` on every pass; force
   only on the firing tick, otherwise the cached `apiCheck.airing` deadline throttles it. This is
   the only API traffic the scheduler causes and it never writes a note.
5. The subject name is resolved per source (title, book or manga, game) and shown as a Notice
   for 8 s.
6. `updateStatusBar` recounts via `airtime.countDue()` (`AirtimeTab.getAiredDueCount + getMaybeDueCount`,
   [wiring/airtime.ts](../../src/app/wiring/airtime.ts)) on every tick and
   on `hoard-data-changed` ([changeSignal.ts](../../src/shared/services/changeSignal.ts)); desktop only, hidden when the setting is off or the count is 0.
   Clicking opens the Upcoming tab.
7. The Upcoming tab badge uses the same `countDue` via its `TabFactory` badge
   ([wiring/tabs.ts](../../src/app/wiring/tabs.ts), `refreshOn: 'data-change'`; `HoardView.updateBadges`).

Failure points: a `releaseTime` not shaped `H:MM` / `HH:MM` never fires (digits are not
range-checked); an entry whose subject no longer
exists is skipped silently. Details of the tab: [modules/upcoming](../modules/upcoming.md).
