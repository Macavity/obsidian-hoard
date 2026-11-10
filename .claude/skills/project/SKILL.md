---
name: project
description: Hoard architecture, naming rules, test setup and known debt. Load when working across layers, adding a tab or storage format, or touching the WatchLog migration.
---

# Hoard project context

Media library (movies, TV, anime, books, manga, games) stored as vault notes. TypeScript, esbuild, vitest + happy-dom, pnpm.

## Layers

1. `src/storage/*` — codecs (`titleCodec`, `readingCodec`, `gameCodec`, `historyLine`, `noteBody`, `baseFile`) and stores (`VaultLayout`, `SharedConfigStore`, `LocalStore`, `HistoryStore`, `EntryIndex`). Pure note <-> object mapping plus vault I/O. Knows only `hoard:` and `Hoard.base`.
   `src/migration/watchlog/` — one-time migration of a WatchLog / WatchLog Sync vault. `index.ts` (`migrateFromWatchLog`, called by `main.ts` before root detection) runs `detect.ts` → `base.ts` (rename + key rewrite) → plugin data (`pluginData.ts`, `loadOwnOrWatchLog` used at load) → `schema1*.ts` (schema-1 data into notes, backup `data.v1-backup.json`) → `widgets.ts` (fence rewrite), then one Notice; returns null when nothing is found. `backupImport.ts` parses and restores WatchLog backups v1–v3 for `backup.ts`.
2. Managers — `DataManager` (watchlist), `ReadingDataManager`, `GameDataManager`. Own the in-memory state, write notes through the stores, append to `HistoryManager`, dispatch `hoard-data-changed`.
3. `HoardView` — ItemView with the `TABS` registry (`dashboard`, `watchlist`, `upcoming`, `reading`, `games`, `custom-lists`, `drafts`, `log`). Each `TabDefinition` has `create(ctx)`; tabs (`*Tab.ts`) and modals (`*Modal.ts`) build DOM with shared pieces in `src/ui/`.
4. `main.ts` — composition root: builds stores and managers, loads data (own store, else WatchLog adoption), runs the WatchLog migration, registers view, commands, widgets (`WidgetRenderer`), status bar, scheduler.

Rule: dependencies point downward; storage knows nothing of managers or UI.

## The note is the record

Entries, groups, progress, ratings live in note properties (frontmatter). `<root>/Hoard.base` (`hoard:` key) holds shared config, `<root>/History.md` the log. `data.json` (`LocalStore`) keeps only per-device state: API keys, caches, colors, layout, filters. Never put entry data in `data.json`.

## Naming rules

- CSS prefix `hoard-`; view type `HOARD_VIEW_TYPE = 'hoard-view'`; event `hoard-data-changed`; base key `hoard:`; widget blocks `hoard`, `hoard-todo`, `hoard-stat`, `hoard-upcoming`, `hoard-now`, `hoard-now-next`.
- Only `src/migration/watchlog/` (and `test/migration/watchlog/`) may know WatchLog: plugin ids, `WatchLog.base`, the `watchlog:` key, `watchlog`/`wl-*` widget names, schema-1 data. Elsewhere only imports from that module and the `priorityEmptyOnly` field docs. The word "legacy" is not used in `src/` or `test/`.
- Obsidian UI text: sentence case, "properties" for YAML metadata.

## Tests

- vitest + happy-dom (real DOM). `obsidian` is aliased to `test/__mocks__/obsidian.ts`; add mock exports there, minimal.
- `test/fakes/fakeApp.ts`: in-memory App/vault. Manager and storage tests build on `test/helpers/setup*.ts` (`setupDataManager`, `setupReadingDataManager`, `setupGameDataManager`, `setupBackup`, `common`); WatchLog schema-1 tests use `test/migration/watchlog/setupSchema1.ts`.
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

`manifest.json`, `src/styles/` (CSS partials, bundled to `dist/styles.css`), `src/types.ts` (data model), `src/storage/VaultLayout.ts` (paths), `src/HoardView.ts`, `src/main.ts`, `docs/index.md` (wiki router).
