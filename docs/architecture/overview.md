---
type: Architecture
title: Overview
description: The layers of the plugin, who depends on whom, and the one event that ties data to UI.
source:
  - src/main.ts
  - src/HoardView.ts
  - src/DataManager.ts
  - src/storage/EntryIndex.ts
  - src/WidgetRenderer.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Overview

Hoard is one Obsidian plugin package (`src/`, flat files plus `storage/`, `ui/`, `csv/`,
`migration/watchlog/`). Dependencies point downward; storage knows nothing of managers or UI.
`.claude/skills/project/SKILL.md` states the same layering with naming rules; this page adds the
mechanism.

```mermaid
flowchart TD
  main[main.ts composition root] --> View[HoardView + TABS]
  main --> WR[WidgetRenderer]
  main --> Sched[airtimeScheduler]
  View --> Tabs[Tabs and modals]
  Tabs --> DM[DataManager]
  Tabs --> RDM[ReadingDataManager]
  Tabs --> GDM[GameDataManager]
  DM --> HM[HistoryManager]
  RDM --> HM
  GDM --> HM
  DM --> API[ApiService / PosterService]
  DM --> Idx[EntryIndex]
  RDM --> Idx
  GDM --> Idx
  Idx --> Codecs[titleCodec / readingCodec / gameCodec]
  DM --> Local[LocalStore data.json]
  DM --> Shared[SharedConfigStore Hoard.base]
  HM --> HS[HistoryStore History.md]
  Idx -. metadataCache events .-> Vault[(vault notes)]
```

## Layers

1. **Storage** ([architecture/storage](storage.md)): `VaultLayout` (paths and ids), `EntryIndex`
   (read-only map id → entry fed by `metadataCache`), codecs (properties ↔ objects), `LocalStore`
   (`data.json`), `SharedConfigStore` (`hoard:` block of `Hoard.base`), `HistoryStore` (`History.md`).
2. **Managers**: [DataManager](../modules/watchlist.md) (titles, groups, Maybe, airtime entries,
   custom-list time lookups), [ReadingDataManager](../modules/reading.md),
   [GameDataManager](../modules/games.md). They own in-memory copies, write notes through
   `processFrontMatter`, log to `HistoryManager`, and notify.
3. **API layer** ([architecture/api-layer](api-layer.md)): `ApiService` (eight services),
   `PosterService`, `ApiCheckQueue`, cover and title search helpers. Called by managers and modals.
4. **UI** ([architecture/ui-kit](ui-kit.md)): `HoardView` with the `TABS` registry, one tab per
   domain, modals, shared pieces in `src/ui/`.
5. **Composition root** `main.ts`: builds everything in field initialisers, loads data, runs the
   [WatchLog import](../modules/import.md), registers view, commands, [widgets](../modules/widgets.md),
   status bar and the scheduler. See [flows/startup](../flows/startup.md).

## The change signal

Every manager ends a user write with `notifyListeners()`: its own `onChange` listeners run, then the
DOM event `hoard-data-changed` is dispatched on `activeDocument`. Consumers: `HoardView`
re-renders the active tab in place (state survives), `WidgetRenderer` re-renders live widgets, the
status bar recounts. External changes (sync, hand edits) arrive through `EntryIndex.onChange`
(debounced 150 ms) and end in the same notify.

## Cross-cutting

- Settings are composed from defaults, `data.json` and the base; see
  [shared vs local](../concepts/shared-vs-local.md).
- Errors from APIs are classified once (`ApiError`, `apiErrorMessage`) so every caller shows the
  same wording; note writes with invalid YAML show a Notice and skip.
- Mobile: `Platform.isMobile` toggles `hoard-mobile` on the view; card size and card text style are
  per device class (`getCardMinWidth`, `isCardTextUnder` in `main.ts`).
