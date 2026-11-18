---
type: Architecture
title: Overview
description: The zones of the plugin, which module may depend on which, how dependencies are injected, and the change signal that ties data to UI.
source:
  - src/app/main.ts
  - src/app/HoardView.ts
  - src/app/wiring/watchlist.ts
  - src/shared/services/EntryNotes.ts
  - src/modules/watchlist/ui/ListTab.ts
  - src/shared/services/SettingsService.ts
  - src/shared/services/changeSignal.ts
  - src/shared/services/changeListeners.ts
  - src/modules/watchlist/services/DataManager.ts
  - src/modules/widgets/ui/WidgetRenderer.ts
  - .fallowrc.json
  - eslint.config.mjs
  - test/architecture.test.ts
  - .github/workflows/ci.yml
source_commit: b8de00d6a3ab46498f5dd550a98b3737482f4350
---

# Overview

Hoard is one Obsidian plugin package. `src/` has three zones: `src/app/` (composition root), `src/modules/<x>/`
(one folder per feature, split into `ui/` and `services/`) and `src/shared/` (`ui`, `services`, `api`, `storage`,
`domain`, `i18n`). The rules below are enforced by tools, not by this page: `.fallowrc.json` (`boundaries`) and
`eslint.config.mjs` are the authority, `test/architecture.test.ts` proves the ESLint rules and the CI job
`rules-changed` flags every change to a rule file in a PR. How to build a module:
`.claude/skills/project/SKILL.md`.

```mermaid
flowchart TD
  app[app: main.ts + wiring/*.ts build everything, HoardView, AddRouter] --> modules
  modules[modules/*: ui + services] --> sui[shared/ui]
  sui --> ssv[shared/services]
  modules --> ssv
  ssv --> sapi[shared/api]
  sapi --> sst[shared/storage]
  sst --> dom[shared/domain]
  sapi --> dom
  ssv --> dom
  sui --> dom
  i18n[shared/i18n] -.-> sui
  sst -.-> Vault[(notes, Hoard.base, History.md, data.json)]
```

## Zones and rules

- **Shared layer order** (fallow zones, each may import only what is listed): `shared/ui` → services, api, domain,
  i18n; `shared/services` → api, storage, domain, i18n; `shared/api` → storage, domain, i18n; `shared/storage` →
  domain only (free of i18n: [i18n](i18n.md)); `shared/domain` and `shared/i18n` → nothing (leaf zones). `app` may import everything; nothing imports `app`.
- **One zone per module**, declared explicitly (`modules/<x>` with pattern `src/modules/<x>/**`), not via
  `autoDiscover`: `fallow audit` analyses the base branch with the current config, and an `autoDiscover` folder the
  base lacks makes the whole config invalid. `coverage.requireAllFiles` fails a new module that has no zone yet.
- **Module edges** (a module may import only itself, `shared` and the modules listed; anything else fails
  `pnpm quality`). Modules without edges: watchlist, import, log, covers.

  | Module | May import |
  |---|---|
  | airtime, backup, custom-lists, dashboard, drafts | games, reading, watchlist |
  | games, reading | covers, watchlist |
  | widgets | watchlist |
  | settings | backup, covers, custom-lists, games, reading, watchlist |

  Modules form no cycle. Adding an edge means editing `.fallowrc.json` and is a reviewed rule change.
- **Layers inside a module** (ESLint): `ui/` must not import `shared/storage`, `app` or a `services/` file (type-only
  imports are fine; pure helpers belong in `shared/domain`). `services/` must not import UI (`ui/`, `shared/ui`) nor use
  `App`, `Modal`, `Notice`, `Setting`, `PluginSettingTab`, `ItemView`, `Menu`; they report codes (`ManagerNotice`) and the UI shows them.
- **Wiring only in app**: `new *Manager` / `new *Service` is an error outside `src/app/`.
- **No inline config**: `eslint-disable` and `fallow-ignore` comments in `src/` are errors (`noInlineConfig`, `scripts/check-eslint-disables.mjs`); fallow exceptions need the maintainer's approval. Data layers read outside data from
  `unknown` (`no-unsafe-type-assertion`, see [storage](storage.md)).

## Injection and ports

Every dependency is a separate `private readonly` constructor parameter; there are no `*Deps` bags and nothing is
called `deps`. Order: `app` (only for Obsidian base classes, passed to `super(app)`), then the collaborators, then
one `opts` object with runtime data (data, never services).

```ts
export type OpenAddReading = (opts: AddReadingOptions) => void; // exported from the child's file

export class AddReadingModal extends Modal {
  constructor(
    app: App,                                  // only for super()
    private readonly settings: SettingsReader,
    private readonly reading: Pick<ReadingDataManager, 'addBook'>,
    private readonly opts: AddReadingOptions,
  ) { super(app); }
}
```

- **Shape, not origin.** A collaborator is a `Pick<Manager, …>` or a consumer-owned interface, not `HoardPlugin`; a
  consumer using more than ~8 methods of one manager may take the whole class via `import type`.
- **Children come as factories.** A parent receives `OpenX` function types (exported from the child's file) or, with
  more than three, a methods-only port it owns (`ListTabModals { openDetail(…): void; … }`). It never receives its
  children's dependencies. Recursion (a detail modal opening another) goes through a closure in the wiring.
- **Wiring** lives in `src/app/wiring/<module>.ts` (`watchlistUi(core) → { openAddTitle, openTitleDetail, createListTab }`)
  and is the only place that `new`s UI; `main.ts` builds the core objects and calls the wiring, `hoardTabs` collects
  the tabs for `HoardView`.
- **`App` only for `super(app)`** (and inside `src/app`). Everything else gets `Vault`, `Workspace`, `MetadataCache` or a
  `Pick` such as `Pick<FileManager, 'trashFile'>`; helpers take what they need (`confirmWith(app)` returns a `confirm`
  function). This includes the inherited `Modal.app`: no `this.app` in `modules` or `shared`.
- **Shared collaborators are real classes with behaviour** ([EntryNotes](../../src/shared/services/EntryNotes.ts): paths,
  ids, read/write, rename following for the data managers), never tuples or bags of loose functions. A function with
  many collaborators becomes a class built in `app`.
- **Lint guards** (`eslint.config.mjs`, proved in `test/architecture.test.ts`; each message points here): no type named
  `*Deps`, no identifier `deps`, no `this.app` in `modules`/`shared`, no `App` import in services, storage and api, no rest
  parameter in a constructor (a spread tuple of dependencies).
- `HoardPlugin` fields are private; `main.ts` hands each wiring function the structural subset.

- **Consumer-owned ports** break module cycles: if A needs something from B and B needs A, the consumer declares its own
  interface in its file and `app` wires the implementation structurally, so no import edge appears. Entry types (`Book`,
  `Game`, …) live in `shared/domain/types.ts`, never in a manager.
- **Settings**: [SettingsService](../../src/shared/services/SettingsService.ts) is the only access. `get()` returns a
  read-only view; `update(fn)` mutates, persists once (date format, type names, API keys, `persistSettings`) and emits the
  change signal once; `stage(fn)` does the same debounced for text typed key by key; `flush()` saves a pending stage on
  unload. The plugin keeps the object as private `state`. Exception: backup restore and the WatchLog import write
  `local.data.settings` directly and then reload the settings (`loadSettings`).
- **Obsidian needs the plugin** (`registerEvent`, `register`, settings tab): inject the `Plugin` type or one bound function (`EntryNotes` takes `registerEvent`).
- **Tests** build classes directly with fakes (`test/fakes`, `test/helpers`), never a faked `HoardPlugin`.

## The change signal

Every manager ends a user write with `notifyListeners()`, which runs its own `onChange` listeners
([changeListeners.ts](../../src/shared/services/changeListeners.ts)). Two channels follow from that:

- **Manager `onChange`** drives the view: `HoardView` registers on the watchlist manager's `onChange`, and tabs (e.g.
  `GamesTab`) on their own manager's; the reading and game managers do not touch the global signal. `HoardView` does
  **not** listen to the global signal.
- **Global signal** `hoard-data-changed` ([changeSignal.ts](../../src/shared/services/changeSignal.ts)), dispatched on the
  **main window's** document by `emitDataChanged()`: `DataManager.notifyListeners` calls it, `SettingsService.update` calls it
  (its `changed` callback), and `main.ts` after adoption/rebuild. Listeners via `onDataChanged`: `WidgetRenderer` (re-renders
  live widgets) and the status bar. Never `activeDocument`: that is the window with focus (the settings window since
  Obsidian 1.15), so a change made there would miss listeners added at load.

External changes (sync, hand edits) arrive through `EntryIndex.onChange` (debounced 150 ms) and end in the same notify.

## Cross-cutting

- Settings are composed from defaults, `data.json`, secret storage and the base; see
  [shared vs local](../concepts/shared-vs-local.md).
- Errors from APIs are classified once (`ApiError`, `apiErrorMessage`); note writes with invalid YAML emit a notice code and skip.
- **Text**: only the UI renders display text. Storage and managers emit codes (`ManagerNotice` through `notifyManager` in
  `main.ts`); `src/shared/i18n/labels.ts` maps stored values; see [i18n](i18n.md).
- Mobile: `Platform.isMobile` toggles `hoard-view--mobile`; card size is per device class (`getCardMinWidth`), card text
  placement per tab (`isCardTextUnder`), both injected from `main.ts`.
- Windows: app-wide state uses the plugin's own window (`window.document`): the change signal and body custom properties such
  as the card size (`applyCardSizeCssVar`), which Obsidian copies from the main body into other windows, never back (host
  behaviour, checked against Obsidian 1.15.0). `activeDocument` is for UI that belongs to the window the user is in.
- Start-up order and the WatchLog wizard: [flows/startup](../flows/startup.md).
