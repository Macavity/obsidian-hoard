---
type: Module
title: Settings
description: How the settings tab is laid out, which settings sync via Hoard.base versus stay device-local, and where to add a new setting.
source:
  - src/SettingsTab.ts
  - src/settingsSplit.ts
  - src/storage/SharedConfigStore.ts
  - src/storage/VaultLayout.ts
  - src/ColorPicker.ts
  - src/types.ts
  - src/main.ts
  - src/backup.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Settings

## Purpose / Boundary
One plugin-wide `HoardPluginSettings` object (`plugin.settings`), edited by `HoardSettingsTab`, persisted in two places. Library-specific settings for Reading and Games live in their managers (`readingDataManager.getSettings()`, game manager), not in `HoardPluginSettings`, but use the same shared/local split. See [storage](../architecture/storage.md) and [shared vs local](../concepts/shared-vs-local.md).

## Entry points
- [SettingsTab.ts](../../src/SettingsTab.ts): `HoardSettingsTab.display()` builds the nav, `renderSection()` switches on `activeSection`.
- [settingsSplit.ts](../../src/settingsSplit.ts): `composeSettings(local, shared)` and `persistSettings(settings, local, shared)`.
- [main.ts](../../src/main.ts): `loadSettings()` / `saveSettings()` wrap the two; `applySharedSettings()` reloads when the base changes (sync) and dispatches `hoard-data-changed`.
- [SharedConfigStore.ts](../../src/storage/SharedConfigStore.ts): `SHARED_SETTING_KEYS`, `splitNested`.

## How it works

### Sections (nav buttons; icon-only on mobile)
General, API, Customize, Watchlist, Drafts, Custom lists, Reading, Widgets, Quick Info. Each `renderX(body)` builds `hoard-sg-page` containing cards from two helpers:
- `settingsGroup(parent, {title, sub, icon, variant, rows?})`: accent header with live status chip (`setChip`). Variant maps to a class via `SETTINGS_GROUP_CLASSES` (full literal class names, for the dead-CSS lint). `rows: true` = body holds bare Obsidian `Setting` rows.
- `sgCard(parent, {label, help?})`: sub-card with optional `(?)` help; used in Customize.
- General: Main, Backup & Restore (export/restore, regenerate notes). Customize: Theme, Cards (size + per-tab text style), Watchlist/Reading/Games colours, Shared (priority, rating system). Watchlist: Main, Import/Export CSV, Folders, Type subfolders.
- Colour pickers: most are native `<input type=color>`; the swatch popover `openColorPicker` in [ColorPicker.ts](../../src/ColorPicker.ts) (plus `deriveFillColor`/`deriveBorderColor`) is used by custom-list/reading column editors, not by SettingsTab (not verified for every SettingsTab colour field).

### Shared vs device-local
`SHARED_SETTING_KEYS` (whitelist): `types, statuses, reviews, priorities, halfStarRatings, typeApiMapping, episodeNumbering, defaultCustomColumns, autoCompleteOnLastEpisode, setFinishDateAutomatically, reading, games`. They live in the `hoard:` block of `Hoard.base` and sync with the vault. Inside `reading` / `games` only `NESTED_SHARED_KEYS` sync (reading: `defaultStatus, bookColumns, mangaColumns`; games: `defaultStatus, statuses, types, platforms`); `defaultFolder` is dropped. Everything else (colours, palettes, layouts, filters, card sizes, and all API keys/ids) goes to `data.json` via `LocalStore`. Rule: shared = vocabulary and schema every device needs to read/write the same notes; secrets are never shared. `RETIRED_KEYS` (`ratingSystem`, `seasonPalette`, `readingTypeColors`) are stripped from the block on next write. `backup.withoutSecrets` strips keys matching `SECRET_KEY` for the vault copy of a backup.

### composeSettings
`DEFAULT_SETTINGS <- local <- shared` (shared wins), on a `structuredClone`. Drops `REMOVED_KEYS`; per-key merge for `listFilters`, `cardTextStyles`. Backfills/migrates: `dateFormat` (invalid -> `european`), `defaultWatchlistView` (old `cards` -> `rows`), `readingTypeColors`, `showUpcomingStatusBar`, `defaultAddType`/`lastAddedType`, empty arrays (`types`, `statuses`, ...), `ratingSystem` (must be exactly 5 well-formed tiers), `rowsLayout` via `normalizeRowsLayout`, Plan-to-watch colour, and inserts the "To be released" status.

### persistSettings
1. Non-shared keys -> `local.data.settings`, `local.queueSave()`.
2. Baseline = `composeSettings({}, shared.get().settings)`; only keys whose JSON differs from the baseline go through `shared.diff` (whitelist filter + canonical compare) and `shared.update`. No diff = no write to the base. `update` patches the `hoard:` block with `vault.process`; an unreadable block aborts with a Notice. In-memory config only advances after a successful write, so a failed save retries on the next diff.
- Text inputs call `debouncedSaveSettings()` (500 ms); toggles/selects call `plugin.saveSettings()` directly. `saveSettings` also resets "no key" checks when TMDB/OMDb keys change.

### API cards
`renderApi` has groups Movies & TV, Anime, Books & manga, Games. `apiProvider(parent, ApiProviderSpec)` renders one card: fields (`secret: true` -> password input with reveal button), a status chip (`status()` recomputed on every keystroke, so an old "Connected" never outlives its key), link, `(?)` help, and a `Test` button (`test()` returns `ChipStatus`; failures go through `testFailure`). Providers with `test`: OMDb, TMDB, MyAnimeList (Jikan endpoint), Google Books, RAWG, IGDB, Steam (also resolves vanity name to SteamID64); AniList and the Manga (MyAnimeList) card are keyless with no Test. Secret fields: OMDb, TMDB, Google Books, RAWG, IGDB client id/secret, Steam key. `apiSegmented` picks the active API per group (`activeApi`, `animeApiSource`, `gamesApiSource`). `renderTypeApiMapping` maps custom types to the anime or movie API; Anime/Movie/TV Show are locked.

### Types as folders
Type names are folder names under the root. `renderTagSection(..., 'types')` passes `validateName: typeNameError` to the tag list; `typeNameError` returns a message when `safeTypeName(name)` differs from the input. `safeTypeName` replaces `* " \ / < > : | ?` with `-`, neutralises leading dots and Windows device names, and appends ` (type)` for reserved folders (`Books`, `Manga`, `Games`, `CustomLists`). `CsvModal` also applies `safeTypeName`. Built-in types (`LOCKED_TYPES`: Anime, Movie, TV Show) cannot be removed; statuses are colour-only.

## Where to change what: new setting checklist
1. [types.ts](../../src/types.ts): add the field to `HoardPluginSettings` and `DEFAULT_SETTINGS`.
2. [settingsSplit.ts](../../src/settingsSplit.ts): add a backfill/validation in `composeSettings` only if old or hand-edited data can be invalid.
3. [SettingsTab.ts](../../src/SettingsTab.ts): add a `Setting`/card in the matching `renderX`; call `plugin.saveSettings()` (debounced for text).
4. Synced across devices? Add the key to `SHARED_SETTING_KEYS` (and `NESTED_SHARED_KEYS` for `reading`/`games`). Never for secrets. Default is device-local.
5. Needs to react live? Dispatch `hoard-data-changed` or call `refreshOpenViews()` as neighbours do.
