---
type: Architecture
title: UI kit
description: How HoardView hosts tabs, which shared building blocks tabs and modals compose, and the UI boundary towards storage.
source:
  - src/HoardView.ts
  - src/ui/TabToolbar.ts
  - src/ui/TabFilters.ts
  - src/ui/SearchFormModal.ts
  - src/ui/SearchPicker.ts
  - src/ui/DuplicateGuard.ts
  - src/VirtualGrid.ts
  - src/VirtualScroller.ts
  - src/LazyCardObserver.ts
  - src/PosterCard.ts
  - src/SearchQuery.ts
  - src/LibraryIndex.ts
  - src/ui/problemText.ts
  - src/ui/detailShared.ts
  - src/ui/typeBadge.ts
source_commit: c835bfb530da4775fa4668bc69029e9896b570e8
---

# UI kit

Tabs and modals are thin; shared behaviour lives in `src/ui/` and a few top-level helpers.
**Boundary**: UI depends on the managers, never on storage. Verified by grepping `src/storage/`
imports: outside managers, the import module (`src/import/watchlog/`) and `main.ts`, only `settingsSplit.ts` and `backup.ts`
(settings persistence), `ApiService.ts` (a type) and two pure helpers (`typeNameProblem` behind
`ui/problemText.ts`, `safeTypeName` in the CSV modal) touch it. No tab or modal imports a store, codec or
index.

```mermaid
flowchart TD
  HV[HoardView + TABS] --> Tab[ListTab / GamesTab / ReadingTab / AirtimeTab]
  Tab --> TB[TabToolbar + TabFilters + ActionBar]
  Tab --> SQ[SearchQuery]
  Tab --> VS[VirtualScroller] --> VG[VirtualGrid] --> PC[PosterCard / GroupCard]
  VG -. removeItem .-> LC[LazyCardObserver]
  Tab --> M[managers]
  Add[Add modals] --> SFM[SearchFormModal] --> SP[SearchPicker]
  Add --> DG[DuplicateGuard]
  Add --> LI[LibraryIndex] --> M
```

## HoardView and the TABS registry

[HoardView.ts](../../src/HoardView.ts) holds `TABS` in tab-bar order; a `TabDefinition` has
`create(ctx)` returning `{ render, destroy? }`, an optional content class and an optional badge.
A **tab switch recreates** the instance (state lost); a **data change re-renders the same
instance** in place via `dataManager.onChange`, so filters and expanded rows survive. Badges are
computed without the tab open and refresh on `data-change` (Upcoming) or `metadata-resolved`
(Drafts, needs the vault scan); desktop shows `Label (N)`, mobile a dot. `refreshUI()` (settings)
re-applies the colour theme and rebuilds. On mobile a `ResizeObserver` pins an explicit height on
the tab content because the WebView freezes flex heights when the keyboard opens; while an editor
inside the tab has focus the height is pinned to the smallest value seen and released on focusout.
While the [WatchLog wizard](../flows/watchlog-import.md) is open (`plugin.importRunning`) `renderTabContent` renders only an "import running" line instead of the tab, and data changes re-render that placeholder rather than a tab instance.

## Shared pieces

- **Toolbar** ([TabToolbar.ts](../../src/ui/TabToolbar.ts), [TabFilters.ts](../../src/ui/TabFilters.ts)):
  search box (per-keystroke store, debounced commit re-renders), `renderToolbarCore` (saved
  filter, Filters, Sorting, action bar while a selection exists), filter dropdown building a draft
  per click and committing on Apply, sorting popover, view switch, add button. Selection mode works
  on ids, not DOM, because grids are virtualised. Tabs hand over `registerCleanup` so popover
  document listeners die with the render.
- **Add-modal skeleton**: `SearchFormModal<R>` mounts a `SearchPicker` (debounced search, a
  generation counter drops stale responses, API errors and "no API" render in the results panel)
  above a form; `DuplicateGuard` shows Continue/Cancel and lets one retry pass; `LibraryIndex`
  is built once per modal and matches by [external id](../concepts/external-id.md) first,
  normalised title second, never fuzzy. Sequence: [flows/add-title](../flows/add-title.md).
- **Virtualised grids**: `VirtualScroller` owns the scroll listener, resize observer, section
  offsets and scroll restore for one or more `VirtualGrid`s; each grid diffs the visible row
  window plus two overscan rows through `buildItem` / `removeItem` and offsets with `padding-top`
  (not `transform`, to avoid layout shift). `computeGridMetrics` mirrors the CSS columns;
  `cardSizeToMinWidth` maps the card-size step to a pixel width. `LazyCardObserver` fetches a
  poster the first time a card flagged `data-needs-poster` enters the viewport. `buildPosterCard`
  draws the card; `POSTER_CARD_TEXT_H` must match the CSS.
- **Search language** (`searchItems` in [SearchQuery.ts](../../src/SearchQuery.ts)): Fuse index
  over declared fields; bare tokens fuzzy and ANDed, `"quoted"` exact, `field:value` scoped (an
  unknown prefix stays text, so `Re:Zero` works), `field:>n` and friends numeric, `a | b` ORs,
  `-token` excludes. Empty query returns null, meaning "no search".
- **Text helpers**: all display text goes through `t()` ([i18n](i18n.md)); shared renderers live in
  `ui/`: `typeBadge`, `choiceGrid` (add choosers), `detailShared` (favourite button, editable title,
  group header, episode-grid text), `scheduleText` and `dateNames` (localized dates), `problemText`.
- **Form primitives**: rows and cells in `ui/FormCells.ts`, `DatePicker`, `StarRating`,
  `StatusDropdown`, `ConfirmModal`, `StickyModal` (sticky footer in detail modals).

CSS: every class carries the `hoard-` prefix and must appear in full in a source literal, because
the dead-CSS lint (`pnpm lint`) matches literals; dynamic choices go through a spelled-out lookup
table. See CONTRIBUTING.

## Where to change what

A new tab: a `TabDefinition` in `TABS` plus `TabName`. Shared toolbar, filter or sort behaviour:
`src/ui/`. A new add modal: extend `SearchFormModal`, build a `LibraryIndex` and a
`DuplicateGuard`. Grid geometry: `VirtualGrid.ts` / `VirtualScroller.ts`; card look:
`PosterCard.ts` and the stylesheets in `src/styles/` (one per UI area, imported in cascade order by `index.css`). Search syntax: `SearchQuery.ts` and `SearchHelpModal.ts`.
