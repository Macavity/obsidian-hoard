---
name: project
description: Hoard architecture, naming rules, test setup and known debt. Load when working across layers, adding a tab or storage format, or touching the WatchLog migration.
---

# Hoard project context

Media library (movies, TV, anime, books, manga, games) stored as vault notes. TypeScript, esbuild, vitest + happy-dom, pnpm.

## Layers

`src/` has three zones; the rules are tool-enforced (`.fallowrc.json` `boundaries`, `eslint.config.mjs`, proven by `test/architecture.test.ts`; wiki: `docs/architecture/overview.md`).

1. `src/app/` — composition root: `main.ts` (builds stores, managers, services; loads data, runs the WatchLog import offer, registers view, commands, widgets, status bar, scheduler), `HoardView.ts` (ItemView with the `TABS` registry), `AddRouter.ts`. The only place that may `new` a `*Manager` / `*Service`.
2. `src/modules/<x>/{ui,services}/` — one folder per feature: watchlist, reading, games, airtime, covers, dashboard, log, drafts, custom-lists, widgets, settings, backup, import. `services/` holds managers and logic (`DataManager`, `ReadingDataManager`, `GameDataManager`, `CustomListManager`, WatchLog import in `import/services/watchlog/`), `ui/` tabs (`*Tab.ts`) and modals (`*Modal.ts`).
3. `src/shared/` in layer order `ui` → `services` → `api` → `storage` → `domain` (`i18n` and `domain` are leaves). `storage`: codecs and stores (`VaultLayout`, `SharedConfigStore`, `LocalStore`, `HistoryStore`, `EntryIndex`, `titleCodec`, …), knows only `hoard:` and `Hoard.base`, free of i18n. `services`: `SettingsService`, `HistoryManager`, `LibraryIndex`, `changeSignal`, `settingsSplit`. `api`: `ApiService`, `PosterService`, source adapters. `domain`: `types.ts`, pure helpers.

Rule: dependencies point downward; modules import only `shared` and the module edges listed in `.fallowrc.json`.

## How a module looks

```
src/modules/<x>/
  ui/        tabs, modals (DOM only)
  services/  managers, logic (no Obsidian UI classes, no UI imports)
src/app/wiring/<x>.ts   builds the module's UI factories and tabs from core objects
```

Reference: `src/modules/watchlist/` (`ListTab` + `DataManager`). Conventions:

- **K1 Constructor parameters, shape not origin.** Every dependency is a `private readonly` constructor parameter: `app` first (only for `super(app)`), then collaborators, then one `opts` object with runtime data. No `*Deps` type, nothing named `deps`, no rest-parameter tuple (lint-enforced). Children come as factories (`OpenX` types exported from the child's file) or a methods-only port the parent owns (`ListTabModals`); a parent never gets its children's dependencies. Never a `HoardPlugin` parameter, never a bag. Shared collaborators are real classes (`EntryNotes`), not tuples.

  ```ts
  export type OpenAddReading = (opts: AddReadingOptions) => void;
  export class AddReadingModal extends Modal {
    constructor(
      app: App,                                // only for super()
      private readonly settings: SettingsReader,
      private readonly reading: Pick<ReadingDataManager, 'addBook'>,
      private readonly opts: AddReadingOptions,
    ) { super(app); }
  }
  // src/app/wiring/reading.ts, the only place that `new`s UI
  const openAddReading: OpenAddReading = (opts) => new AddReadingModal(app, settings, reading, opts).open();
  ```
- **K2 Port belongs to the consumer.** If A needs B and B needs A, the consumer declares its own interface (or `OpenX` factory type) in its file; `src/app/wiring` implements it. No import edge, no module cycle. Entry types come from `shared/domain/types.ts`, never from a manager.
- **K3 Settings** only through `SettingsService`: read `this.settings.get()` (read-only view), change `await this.settings.update((s) => { s.x = … })` (`stage` for text typed key by key, `flush` on unload). Never save directly.
- **K4 Obsidian objects are injected narrowly.** `App` only for `super(app)` or inside `src/app`; elsewhere take `Vault`, `Workspace`, `MetadataCache` or a `Pick` (`this.app` is a lint error in `modules`/`shared`, `App` import in services too). `registerEvent`/`register`: inject the `Plugin` type or one bound function, never `HoardPlugin`.
- Tests construct classes directly with fakes (`test/fakes/fakeApp.ts`, `test/helpers/*`, `fakeSettings`).
- `ui/` may not import `shared/storage`, `app`, or a `services/` file as value (type imports are fine); `services/` may not import UI or use `Modal`, `Notice`, `Setting`, `ItemView`, `Menu` (report a `ManagerNotice` code). `eslint-disable` is an error in `src/`.

The authority is `eslint.config.mjs` and `.fallowrc.json`; this list is a summary. Changing either is a reviewed rule change (CI job `rules-changed` flags it) and needs the maintainer's approval.

**New module:** create `src/modules/<x>/{ui,services}/`; add a zone `modules/<x>` (pattern `src/modules/<x>/**`) and a `from: "modules/<x>"` rule in `.fallowrc.json` (allowed: shared zones plus needed module edges), and list it in the `test` and `app` rules; zones are explicit, not `autoDiscover`, so `fallow audit` against an older base without the folder still runs (`requireAllFiles` fails a module without zone); add `src/app/wiring/<x>.ts` (`<x>Ui(core)` builds the `Open<X>` factories and the tab, the only place that `new`s the module's UI), call it from `src/app/main.ts` and add the tab to `hoardTabs` in `src/app/wiring/tabs.ts` for a tab; update the wiki.
**New module edge:** add the target to the `allow` list of the importing module in `.fallowrc.json`. First try a consumer-owned port (K2); an edge must not create a cycle.

## The note is the record

Entries, groups, progress, ratings live in note properties (frontmatter). `<root>/Hoard.base` (`hoard:` key) holds shared config, `<root>/History.md` the log. `data.json` (`LocalStore`) keeps only per-device state: API keys, caches, colors, layout, filters. Never put entry data in `data.json`.

## Naming rules

- CSS prefix `hoard-`; view type `HOARD_VIEW_TYPE = 'hoard-view'`; event `hoard-data-changed`; base key `hoard:`; widget blocks `hoard`, `hoard-todo`, `hoard-stat`, `hoard-upcoming`, `hoard-now`, `hoard-now-next`.
- Only `src/modules/import/` (and `test/import/`) may know WatchLog: plugin ids, `WatchLog.base`, the `watchlog:` key, `watchlog`/`wl-*` widget names, schema-1 data. Elsewhere only imports from that module and the `priorityEmptyOnly` field docs. The word "legacy" is not used in `src/` or `test/`.
- Obsidian UI text: sentence case, "properties" for YAML metadata.

## Tests

- vitest + happy-dom (real DOM). `obsidian` is aliased to `test/__mocks__/obsidian.ts`; add mock exports there, minimal.
- `test/fakes/fakeApp.ts`: in-memory App/vault. Manager and storage tests build on `test/helpers/setup*.ts` (`setupDataManager`, `setupReadingDataManager`, `setupGameDataManager`, `setupBackup`, `common`); WatchLog schema-1 tests use `test/import/watchlog/setupSchema1.ts`.
- UI tests in `test/ui/` use the `test/helpers/fakeEl.ts` DOM double.
- `test/fixtures/data-v1.json` is verbatim WatchLog schema-1 data; do not edit.
- `pnpm test` also writes Istanbul coverage (read by fallow CRAP scores).

## Checks

- `pnpm build` — tsc + bundle. `pnpm test`. `pnpm lint` — eslint plus dead-CSS check: every class in `src/styles/*.css` must appear literally in `src/`, so no template-string class names (`hoard-${x}`); write the full class names.
- `pnpm quality` / `quality:audit` — fallow; no exceptions or suppressions without user approval.
- `pnpm smoke`, `pnpm mobile:smoke` — need running Obsidian with `hoard-test-vault/`.

## Known debt

- Large files (`DataManager`, tabs, modals) and low UI test coverage inherited from the fork; `pnpm quality` full analysis is red.
- `obsidianmd/settings-tab/prefer-setting-definitions` is off until `SettingsTab` migrates to setting definitions.

## Key files

`manifest.json`, `src/styles/` (CSS partials, bundled to `dist/styles.css`), `src/shared/domain/types.ts` (data model), `src/shared/storage/VaultLayout.ts` (paths), `src/app/HoardView.ts`, `src/app/main.ts`, `docs/index.md` (wiki router).
