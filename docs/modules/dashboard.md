---
type: Module
title: Dashboard
description: What the dashboard counts as watched, where its numbers come from, and how the layout differs on mobile.
source:
  - src/DashboardTab.ts
  - src/HoardView.ts
  - src/DataManager.ts
  - styles.css
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Dashboard

Read-only overview and the tab the panel opens on. [DashboardTab.ts](../../src/DashboardTab.ts)
persists nothing; `render()` precomputes titles by type, planned titles, books, manga, games and
the reading aggregates once, then draws cards, "More statistics", suggestions and the recent lists.
`CollageUtil.ts` is not used here.

## The numbers

- **Rings or rectangles** (`dashboardCardStyle`): one Total card, one card per configured watch
  type, Books, Manga. Percent = Completed / counted, where `statsFor` excludes "Dropped" and
  "To be released" from the denominator and counts only "Completed" as watched. Time watched and
  remaining come from `DataManager.getTotalTimeWatched` / `getTotalTimeRemaining`; a Time played
  column appears only when summed game playtime is > 0. Reading cards skip "To be released";
  "left" = Reading + Plan to Read; books count page equivalents (`bookPageEquivalents` folds words
  in), manga count chapters with volumes in the subline. No Games ring.
- **More statistics**: an accordion repainted in place so it stays open. Source pills All /
  Watchlist / Reading / Games are kept in a static field, so the choice survives tab switches
  within a session. The selection is normalised into one `StatItem[]` (games use genre as type)
  feeding library size, completed (games on `GAME_FINISHED_STATUS`), added over time, by status,
  by type, by year; Watchlist only: time by year and top actors, directors, studios
  (`dashboardTopCredits`, default 5).
- **Suggestions** exist only with "Plan to watch" titles: shortest Anime, Movie and TV Show by
  `totalEpisodes * (episodeDuration || 24)`, type names hardcoded, plus a random pick.
- **Recently watched / added**: `getRecentlyWatched(3)`, `getRecentlyAdded(3)`, Watchlist only.

## Mobile

The TypeScript has no platform branch. `HoardView` toggles `hoard-mobile` from `Platform.isMobile`;
in `styles.css` the desktop grid is a fixed three columns, the mobile grid is `auto-fit` and a
container-query context (`hoard-dash`) under which the unified card re-flows.

## Where to change what

| Change | Place |
|---|---|
| What counts as completed or in the denominator | `statsFor` |
| Reading ring maths | `aggregateBooks`, `aggregateManga`, `bookPageEquivalents` in `types.ts` |
| Time totals | `calcTimeWatched`, `calcTimeRemaining` in `DataManager.ts` |
| A new statistic | `renderStatsContent`, extend `StatItem` if needed |
| Mobile layout | `.hoard-mobile` and `@container hoard-dash` rules in `styles.css` |
