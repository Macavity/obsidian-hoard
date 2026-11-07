---
type: Module
title: Dashboard
description: What the Dashboard tab computes (progress rings, time watched/remaining, reading aggregates, More Statistics, suggestions), from which managers, and how desktop and mobile layouts differ.
source:
  - src/DashboardTab.ts
  - src/HoardView.ts
  - src/DataManager.ts
  - styles.css
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Dashboard

## Purpose / Boundary

Read-only overview, opened by default (`HoardView` sets `activeTab = 'dashboard'` on open). `DashboardTab` ([DashboardTab.ts](../../src/DashboardTab.ts)) has no persistence and no actions besides the stats source filter and the Random shuffle. Per the shared view mechanism the tab is recreated on tab switch and re-rendered on data change (see [overview](../architecture/overview.md)). [CollageUtil.ts](../../src/CollageUtil.ts) is NOT used here (no import in DashboardTab.ts); it is a group-card cover collage helper for other views.

## Entry points

- Registered in `TABS` in [HoardView.ts](../../src/HoardView.ts): `new DashboardTab(containerEl, plugin, dataManager, plugin.readingDataManager)`. Games are read via `plugin.gameDataManager`.
- `render()` is the only entry: precomputes `allTitles` (grouped by type), `planTitles` (status "Plan to watch"), books, manga, games and the reading aggregates once, then calls `renderCards`, `renderMoreStatistics`, `renderSuggestions`, `renderRecentlyWatched`, `renderRecentlyAdded`.

## How it works

### Ring / rectangle cards (`renderCards`)
Style from `settings.dashboardCardStyle` (`'rectangles'` or rings, default branch = rings). Grid `hoard-rings-grid`:
1. Unified card (`renderUnifiedCard`): Total ring/bar plus Time Watched, Time Remaining and, only if the sum of `game.playtimeMinutes` is > 0, Time Played (4-up variant). Times come from `DataManager.getTotalTimeWatched()` / `getTotalTimeRemaining()` (sum of per-title `calcTimeWatched` / `calcTimeRemaining`; those internals not verified), formatted with `formatTime`.
2. One card per configured watch type (`settings.types`): percent = Completed / counted. `statsFor` excludes status "Dropped" and "To be released" from the denominator; only "Completed" counts as watched. Total card uses all titles with the same rule.
3. Books and Manga cards (`renderReadingCard`, colour via `getReadingTypeColor`): `aggregateBooks` / `aggregateManga` skip "To be released"; `left` = Reading + Plan to Read; books use `bookPageEquivalents` (pages, words folded in as page equivalents), manga chapters read/total plus volumes. Subline shows pages or chapters and volumes. No Games ring.
Rings are hand-built SVG (`makeRingSvg`, r=45, `RING_CIRCUMFERENCE`); `fillRing` / `fillRect` build the labelled content.

### More Statistics (`renderMoreStatistics`)
Accordion, repainted in place (not a full re-render, so it stays open). Source pills All / Watchlist / Reading / Games kept in the static `DashboardTab.activeSources` (survives tab switches for the session, resets on reload; empty set falls back to All). `renderStatsContent` builds one normalized `StatItem[]` over the selected libraries (games use their genre as `type`) feeding: pinned "Titles in library" and "Completed" (games complete on `GAME_FINISHED_STATUS`), Added Over Time, By Status, By Type, By Year. Watchlist-only: Time by Year, Top Actors/Directors/Studios (`countCredits`, N = `settings.dashboardTopCredits`, default 5).

### Lower sections
- Suggestions (only if there are "Plan to watch" titles): shortest Anime / Movie / TV Show by `totalEpisodes * (episodeDuration || 24)`, falling back to any planned title of the type, plus a Random pick with shuffle. Types are hardcoded names.
- Recently watched / added: `DataManager.getRecentlyWatched(3)` / `getRecentlyAdded(3)`, rows with type badge, next episode (`getNextUnwatchedEpisode`) and progress (`getProgress`). Watchlist only.

### Desktop vs mobile
`HoardView.buildUI` toggles class `hoard-mobile` from `Platform.isMobile` (not a media query). In styles.css, desktop `.hoard-rings-grid` is a fixed 3-column grid; `.hoard-view.hoard-mobile .hoard-rings-grid` uses `repeat(auto-fit, minmax(min(110px,100%),1fr))` and becomes a container query context `hoard-dash`; the unified card adapts at `@container hoard-dash` breakpoints 559px and 439px. The TS code itself has no platform branches.

## Where to change what

| Change | Place |
|---|---|
| Completed / denominator rule of rings | `statsFor` |
| Reading ring maths | `aggregateBooks`, `aggregateManga`, `bookPageEquivalents` (types.ts) |
| Time totals | `getTotalTimeWatched/Remaining`, `calcTimeWatched/Remaining` in DataManager.ts |
| New stat card | `renderStatsContent` (+ `renderCountSection`), extend `StatItem` if needed |
| Source filter | `STAT_SOURCES`, `renderFilterButtons` |
| Ring vs rectangle look | `makeRingSvg`, `fillRing`, `fillRect`, `dashboardCardStyle` setting |
| Mobile layout | `.hoard-mobile` and `@container hoard-dash` rules in styles.css |
| Suggestions / recent lists | `renderSuggestions`, `renderRecentlyWatched`, `renderRecentlyAdded` |

## Links
[overview](../architecture/overview.md), [ui-kit](../architecture/ui-kit.md), [storage](../architecture/storage.md), [watchlist](watchlist.md), [reading](reading.md), [games](games.md), [settings](settings.md).
