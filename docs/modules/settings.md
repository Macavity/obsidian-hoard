---
type: Module
title: Settings
description: How the settings tab is organised, how the API cards and type validation work, and the checklist for adding a setting.
source:
  - src/SettingsTab.ts
  - src/settingsSplit.ts
  - src/storage/SharedConfigStore.ts
  - src/storage/VaultLayout.ts
  - src/types.ts
  - src/main.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Settings

One `HoardPluginSettings` object (`plugin.settings`), composed from defaults, `data.json` and the
base and persisted back by the whitelist; that split, the backfills in `composeSettings` and the
diff-only write in `persistSettings` are in [shared vs local](../concepts/shared-vs-local.md).
Reading and games keep their own settings objects in their managers, split the same way
(`splitNested`). `main.ts` wraps the two in `loadSettings` / `saveSettings`; a changed TMDB or
OMDb key also re-arms "no key" API checks; a synced base change re-composes and dispatches
`hoard-data-changed`.

## The tab

[SettingsTab.ts](../../src/SettingsTab.ts) renders one section at a time (nav: General, API,
Customize, Watchlist, Drafts, Custom lists, Reading, Widgets, Quick Info; icon-only on mobile).
Two helpers build every card: `settingsGroup` (accent header with a live status chip, variant
classes spelled out in `SETTINGS_GROUP_CLASSES` for the dead-CSS lint) and `sgCard` (sub-card with
optional help). Text inputs save debounced (500 ms); toggles and selects save at once. General
holds Backup & Restore ([backup](backup.md)); Watchlist holds CSV import/export and type folders.

## API cards

`renderApi` groups Movies & TV, Anime, Books & manga, Games. `apiProvider(spec)` renders one card:
fields (`secret: true` becomes a password input with reveal), a status chip recomputed on every
keystroke so a stale "Connected" never outlives its key, a help link, and a Test button that calls
the service's `check*Connection` and maps failures through `testFailure`. AniList and the manga
card are keyless and have no Test; Steam's Test also resolves a vanity name to a SteamID64.
`apiSegmented` picks the active service per group (`activeApi`, `animeApiSource`,
`gamesApiSource`); `renderTypeApiMapping` routes custom types to the anime or movie API, with
Anime, Movie and TV Show locked.

## Types as folders

A type name is a folder under the root, so the tag editor validates with `typeNameError`
([VaultLayout.ts](../../src/storage/VaultLayout.ts)): a message when `safeTypeName` would change
the input (unsafe characters, leading dots, Windows device names, or a reserved folder such as
Books, Manga, Games, CustomLists). Built-in types (`LOCKED_TYPES`) cannot be removed; statuses
are colour-only.

## Adding a setting

1. `HoardPluginSettings` and `DEFAULT_SETTINGS` in [types.ts](../../src/types.ts).
2. A backfill in `composeSettings` only if old or hand-edited data can be invalid.
3. A `Setting` or card in the matching `render*` of the tab, saving through `plugin.saveSettings()`.
4. Synced across devices? Add the key to `SHARED_SETTING_KEYS` (or `NESTED_SHARED_KEYS` for
   reading/games). Never a secret. Default is device-local.
5. Needs a live effect? Dispatch `hoard-data-changed` as neighbouring settings do.
