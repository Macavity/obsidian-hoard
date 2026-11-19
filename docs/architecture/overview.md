---
type: Architecture
title: Overview
description: The zones of the plugin, which zone may import which, how modules talk to each other through their exports, how dependencies are injected, and the change signal that ties data to UI.
source:
  - .fallowrc.json
  - eslint.config.mjs
  - test/architecture.test.ts
  - .github/workflows/ci.yml
  - src/app/main.ts
  - src/app/HoardView.ts
  - src/app/wiring/watchlist.ts
  - .claude/agents/exports-reviewer.md
  - CLAUDE.md
  - src/modules/watchlist/exports/index.ts
  - src/modules/watchlist/exports/titles.ts
  - src/modules/settings/exports/settingsCodec.ts
  - src/modules/custom-lists/domain/customList.ts
  - src/modules/settings/services/SettingsService.ts
  - src/shared/services/EntryNotes.ts
  - src/shared/services/changeSignal.ts
  - src/shared/services/changeListeners.ts
  - src/modules/watchlist/services/DataManager.ts
source_commit: 4c5ff3ab895535b09f6d6ba5a885a7bf887ffb16
---

# Overview

Hoard is one Obsidian plugin package. `src/` has four code zones: `src/app/` (composition root), `src/modules/<x>/`
(one folder per feature: `exports/` where others need something, `ui/`, `services/`, `domain/`), `src/design-system/` (the UI kit, see
[ui-kit](ui-kit.md)) and `src/shared/` (`api`, `storage`, `services`, `domain`, `i18n`). The rules below are
enforced by tools, not by this page: `.fallowrc.json` (`boundaries`) and `eslint.config.mjs` are the authority,
`test/architecture.test.ts` proves the ESLint rules and the CI job `rules-changed` flags every change to a rule file
and (step "Flag changes to module exports") to `src/modules/*/exports/*` in a PR. How to build a module: `.claude/skills/project/SKILL.md`.

```mermaid
flowchart TD
  app[app: main.ts + wiring/*.ts build everything] --> mod
  app --> ds
  app --> sh
  mod["modules/x: ui, services, domain"] -->|values| ds[design-system]
  mod -->|values| sh["shared: api, storage, services, domain, i18n"]
  ds --> sh
  mod --> ex["module-exports: modules/*/exports/"]
  sh --> ex
  ex --> sh
  ex --> ex
  sh -.-> Vault[(notes, Hoard.base, History.md, data.json)]
```

## Zones and rules

Fallow zones are matched **first match wins**, so `module-exports` (`src/modules/*/exports/**`) precedes the module
zones and an exports folder is never part of its module's zone.

| Zone | Pattern | May import |
|---|---|---|
| `app` | `src/app/**` | every module, `module-exports`, `design-system`, `shared` |
| `modules/<x>` (one per module) | `src/modules/<x>/**` | `design-system`, `module-exports`, `shared` (not itself: a module's own files are the same zone) |
| `module-exports` | `src/modules/*/exports/**` | `module-exports`, `shared` |
| `design-system` | `src/design-system/**` | `shared` |
| `shared` | `src/shared/**` | `module-exports` |
| `test` | `test/**` | everything |
| `tooling`, `styles`, `obsidian-mock` | `scripts/**`, `*.mjs`, `vitest.config.ts` / `src/styles/**` / `test/__mocks__/obsidian.ts` | tooling: the mock; the other two: nothing |

- **Every module rule is identical** (`design-system`, `module-exports`, `shared`, `obsidian-mock`; no `allowTypeOnly`
  anywhere). A module reaches another module only through that module's `exports/` (imported as `…/<x>/exports`),
  never its internals, so there is no module-to-module edge into `ui/`, `services/` or `domain/`. `exports/` cannot
  import module internals either.
- **`exports/` is a module's deliberate public surface**: its models (`HoardTitle`, `Book`, `Game`,
  `HoardPluginSettings`, `BackupFile`, …), the **role interfaces** the managers `implement` (`TitleReader`,
  `TitleWriter`, `ReadingReader`, `GameWriter`, `SettingsReader`, `AirtimeReader`, `DraftStore`, …), `Open<X>` factory
  types, and the constants and pure functions others need (`DEFAULT_SETTINGS`, `settingsCodec`, `GAME_AUTO_STATUS`,
  `READING_STATUSES`, `titles`, `airtime`, `newTitle`/`newGame`/`newReading`). Entry point is `exports/index.ts`; fallow
  follows re-exports to the defining file, so public code must **physically live in `exports/`**, a re-export of an
  internal file fails. A role lives with its consumer, not with the implementing manager (`AirtimeReader` and `AirtimeStore` in
  `airtime/exports`, `DraftStore` in `drafts/exports`; `DataManager` implements them). `custom-lists` has no `exports/` (its `CustomList` type sits in
  `custom-lists/domain/customList.ts`; nobody outside imports it).
- **`shared` may import module exports, types and values** (constants, codec reference data): `shared/storage` codecs
  read `settingsDefaults`, `readingDefaults`, `gameDefaults`, `titles` from there. `shared` holds no module logic itself;
  values only one module needs stay in its `exports/` or `domain/`, values two or more modules need (dates, columns,
  tags, `imdb`, `api/credits`) stay in `src/shared/`. The design system imports no module exports, so it knows no module
  and no settings.
- **Exports review**: every change under `src/modules/*/exports/` and every new `shared` → exports import goes through
  the read-only agent [exports-reviewer](../../.claude/agents/exports-reviewer.md) before the commit (rule in
  [CLAUDE.md](../../CLAUDE.md)). It pushes back per symbol (outside consumer? owner? kind? width? logic leak?).
  Unresolved challenges go to the user.
- `obsidian-mock` is allowed for modules, the design system and `shared` only as an artifact: fallow resolves
  `obsidian` through the vitest alias to `test/__mocks__/obsidian.ts`.
- **Inside `shared`** fallow draws no lines (one zone). What is kept out of lower layers is guarded by lint and tests:
  no i18n import in storage, domain, exports or the data managers ([i18n](i18n.md)); the services lint rules below.
- **One zone per module**, declared explicitly (`modules/<x>`), not via `autoDiscover`: `fallow audit` analyses the base
  branch with the current config, and an `autoDiscover` folder the base lacks makes the whole config invalid.
  `coverage.requireAllFiles` fails a new file that belongs to no zone. A new module therefore needs its zone and a
  rule in `.fallowrc.json`, which is a reviewed rule change.
- **Layers inside a module** (ESLint, `src/modules/*/ui/**`): UI must not import `shared/storage`, `app` or a
  `services/` file as a value (type imports are fine; `shared/services` is allowed). Pure helpers belong in
  `shared/domain` or the module's `domain/`.
- **Services** (`src/modules/*/services`, `shared/services`, `shared/storage`, `shared/api`) must not import UI
  (`**/ui/**`, `**/design-system/**`) nor use `App`, `Modal`, `Notice`, `Setting`, `PluginSettingTab`, `ItemView`,
  `Menu` or a namespace/default import of `obsidian`; they report codes (`ManagerNotice`) and the UI shows them.
- **Wiring only in app**: `new *Manager` / `new *Service` is an error outside `src/app/`.
- **No inline config**: `eslint-disable` and `fallow-ignore` comments in `src/` are errors (`noInlineConfig`,
  `scripts/check-eslint-disables.mjs`); fallow exceptions need the maintainer's approval. Data layers read outside data
  from `unknown` (`no-unsafe-type-assertion`, see [storage](storage.md)).

## Modules talk through exports

A module's `exports/` is its public surface. A consumer in another module names the **role** it needs, never the
manager class: `DataManager implements TitleReader, TitleStats, TitleWriter, AirtimeStore, DraftStore,
TitleMaintenance, TitleBackup` (`AirtimeStore`, which extends `AirtimeReader`, and `DraftStore` come from the airtime and drafts exports); the reading and game managers implement their `*Reader/Writer/SettingsAccess/Snapshot`
roles; `SettingsService implements SettingsReader, SettingsWriter`. Dashboard, airtime, backup and the others import
these as types (usually `Pick<…>`; constants and pure functions are plain value imports), and `app` hands in the real objects. Inside a module the UI may take its own
manager class by `import type`. Where two managers need each other at runtime, `main.ts` links them with lambdas, so
neither imports the other.

## Injection and ports

Every dependency is a separate `private readonly` constructor parameter; there are no `*Deps` bags and nothing is
called `deps`. Order: `app` (only for Obsidian base classes, passed to `super(app)`), then the collaborators, then
one `opts` object with runtime data (data, never services).

```ts
export type OpenAddReading = (opts: AddReadingOptions) => void; // exported from the child's file

export class AddReadingModal extends Modal {
  constructor(
    app: App,                                  // only for super()
    private readonly settings: SettingsReader, // role from settings/exports
    private readonly reading: ReadingDataManager, // own module: class by import type
    private readonly opts: AddReadingOptions,
  ) { super(app); }
}
```

- **Shape, not origin.** A collaborator is a role from an `exports/`, a `Pick<Manager, …>` or a consumer-owned interface,
  not `HoardPlugin`.
- **Children come as factories.** A parent receives `OpenX` function types (exported from the child's file) or, with
  more than three, a methods-only port it owns (`ListTabModals { openDetail(…): void; … }`). It never receives its
  children's dependencies. Recursion (a detail modal opening another) goes through a closure in the wiring.
- **Wiring** lives in `src/app/wiring/<module>.ts` (`watchlistUi(core) → { openAddTitle, openTitleDetail, createListTab }`)
  and is the only place that `new`s UI; `main.ts` builds the core objects and calls the wiring, `hoardTabs`
  (`wiring/tabs.ts`) collects the tabs for `HoardView`.
- **`App` only for `super(app)`** (and inside `src/app`). Everything else gets `Vault`, `Workspace`, `MetadataCache` or a
  `Pick` such as `Pick<FileManager, 'trashFile'>`; helpers take what they need (`confirmWith(app)` returns a `confirm`
  function). This includes the inherited `Modal.app`: no `this.app` in `modules`, `design-system` or `shared`.
- **Shared collaborators are real classes with behaviour** ([EntryNotes](../../src/shared/services/EntryNotes.ts): paths,
  ids, read/write, rename following for the data managers), never tuples or bags of loose functions. A function with
  many collaborators becomes a class built in `app`.
- **Lint guards** (`eslint.config.mjs`, proved in `test/architecture.test.ts`; each message points here): no type named
  `*Deps`, no identifier `deps`, no `this.app` in `modules`/`design-system`/`shared`, no `App` import in services, storage
  and api, no rest parameter in a constructor (a spread tuple of dependencies).
- `HoardPlugin` fields are private; `main.ts` hands each wiring function the structural subset.
- **Settings**: [SettingsService](../../src/modules/settings/services/SettingsService.ts) is the only access. `get()`
  returns a read-only view; `update(fn)` mutates, persists once through the plugin's `persistAll` and emits the change
  signal once; `stage(fn)` does the same debounced for text typed key by key; `flush()` saves a pending stage on
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
  (its `changed` callback), the settings tab in one place and `main.ts` after adoption/rebuild. Listeners via
  `onDataChanged`: `WidgetRenderer` (re-renders live widgets) and the status bar. Never `activeDocument`: that is the
  window with focus (the settings window since Obsidian 1.15), so a change made there would miss listeners added at load.

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
