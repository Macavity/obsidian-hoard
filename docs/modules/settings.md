---
type: Module
title: Settings
description: How the settings tab is organised, how the API cards and type validation work, and the checklist for adding a setting.
source:
  - src/modules/settings/exports.ts
  - src/modules/settings/domain/model.ts
  - src/modules/settings/services/roles.ts
  - src/modules/settings/domain/settingsDefaults.ts
  - src/modules/settings/services/SettingsService.ts
  - src/modules/settings/services/settingsSplit.ts
  - src/modules/settings/domain/apiRouting.ts
  - src/modules/settings/ui/SettingsTab.ts
  - src/modules/settings/ui/problemText.ts
  - src/app/wiring/settings.ts
  - src/app/main.ts
  - src/modules/settings/domain/settingsCodec.ts
  - src/shared/storage/SharedConfigStore.ts
  - src/shared/domain/typeName.ts
  - src/shared/api/apiSources.ts
source_commit: a08c524
---

# Settings

One `HoardPluginSettings` object (`domain/model.ts`; [exports.ts](../../src/modules/settings/exports.ts) re-exports it with the roles
`SettingsReader` and `SettingsWriter` from `services/roles.ts`, plus `DEFAULT_SETTINGS`, `normalizeSettings` and `REMOVED_SETTINGS`), owned by the plugin as private `state`; everything else reaches it through
[SettingsService](../../src/modules/settings/services/SettingsService.ts), which `implements` both roles
(`get`, `update`, `stage`, `flush`). Other modules type against `SettingsReader` / `SettingsWriter`, never the
service. The object is composed from defaults, `data.json` and the base and persisted back by the whitelist, both
in [settingsSplit.ts](../../src/modules/settings/services/settingsSplit.ts) (`composeSettings`, `persistSettings`);
that split, the rules in `normalizeSettings` ([settingsCodec.ts](../../src/modules/settings/domain/settingsCodec.ts)) and the
diff-only write are in [shared vs local](../concepts/shared-vs-local.md).
API keys, Steam id, IGDB credentials and `jikanBaseUrl` are not in `data.json` but in Obsidian's secret
storage: `loadSettings` merges them in, `persistAll` (what `SettingsService.update` runs) writes them through `SecretStore`
([shared vs local](../concepts/shared-vs-local.md)).
Reading and games keep their own settings objects in their managers, split the same way
(`splitNested`); their stored blocks are read field by field by `readReadingSettings` /
`readGamesSettings` ([featureSettings.ts](../../src/shared/storage/featureSettings.ts)), which backup restore uses too. `main.ts` wraps the two in `loadSettings` / `persistAll`; a changed TMDB or
OMDb key also re-arms "no key" API checks; a synced base change re-composes and dispatches
`hoard-data-changed`. Module-only helper: `needsStudioFetch` in `domain/settingsHelpers.ts`.

## The tab

[SettingsTab.ts](../../src/modules/settings/ui/SettingsTab.ts) (built in [wiring/settings.ts](../../src/app/wiring/settings.ts); it takes
roles such as `TitleReader & TitleMaintenance`, `ReadingReader & ReadingSettingsAccess`, `GameReader & GameSettingsAccess`, the backup
functions and the dialog openers `OpenCsv`, `OpenReadingCsv`, `OpenSteamSync`) renders one section at a time (nav: General, API,
Customize, Watchlist, Drafts, Custom lists, Reading, Widgets, Quick Info; icon-only on mobile).
Two helpers build every card: `settingsGroup` (accent header with a live status chip, variant
classes spelled out in `SETTINGS_GROUP_CLASSES` for the dead-CSS lint) and `sgCard` (sub-card with
optional help). Text inputs save debounced (500 ms); toggles and selects save at once. General
holds Backup & Restore ([backup](backup.md)); Watchlist holds CSV import/export and type folders. Tracker migration is [guide/migrate-notes/](../flows/migrate-notes.md), not a settings row.

## API cards

`renderApi` groups Movies & TV, Anime, Books & manga, Games. `apiProvider(spec)` renders one card:
fields (`secret: true` becomes a password input with reveal), a status chip recomputed on every
keystroke so a stale "Connected" never outlives its key, a help link, and a Test button that calls
the service's `check*Connection` and maps failures through `testFailure`. AniList and the manga
card are keyless and have no Test; Steam's Test also resolves a vanity name to a SteamID64.
`apiSegmented` picks the active service per group: `activeApi` (`Cinemeta | OMDb | TMDB`, default
Cinemeta), `booksApiSource` (`openlibrary | google`), `animeApiSource`, `gamesApiSource`
(`steam | rawg | igdb`, default Steam). All are device-local. The keyless choice shows a "{name} · no
key needed" chip; a keyed choice without its key falls back at runtime through
`effectiveMediaSource` / `effectiveBookSource` / `effectiveGameSource`
([apiSources.ts](../../src/shared/api/apiSources.ts)), the chip shows "key needed" and `fallbackHint` adds
"Uses {source} until a key is set." Stored values are never rewritten by the fallback.
`renderTypeApiMapping` routes custom types to the anime or movie API, with
Anime, Movie and TV Show locked; which types are locked (and to which providers) and the select value parsing are the pure `typeApiRoute` / `parseApiGroup` in [apiRouting.ts](../../src/modules/settings/domain/apiRouting.ts). The bulk studio fetch (`SettingsTab`) still needs `getApiGroupForType`, now imported from `shared/api/apiGroup.ts`, no longer from watchlist; whether this API logic belongs in watchlist, shared or the settings module is open (issue #48).

## Types as folders

A type name is a folder under the root, so the tag editor validates with `typeNameProblem`
([typeName.ts](../../src/shared/domain/typeName.ts)): a `{ reason: 'reserved' | 'unsafe' }` code (text from
`typeNameProblemText` in `ui/problemText.ts`) when `safeTypeName` would change
the input (unsafe characters, leading dots, Windows device names, or a reserved folder such as
Books, Manga, Games, CustomLists). Built-in types (`LOCKED_TYPES`) cannot be removed; statuses
are colour-only.

## Adding a setting

1. `HoardPluginSettings` in `domain/model.ts` and `DEFAULT_SETTINGS` in [settingsDefaults.ts](../../src/modules/settings/domain/settingsDefaults.ts). The default is
   not optional: a key without one counts as unknown and passes through unchecked. Both are re-exported by `exports.ts`; a change to its lines goes through the `exports-reviewer` agent (`.claude/agents/exports-reviewer.md`) before it is committed.
2. Nothing for a value whose kind is all that can be wrong: a stored value of another kind than the
   default's falls back to the default. List elements are checked too: invalid ones are dropped, and if
   what is left breaks the setting's own rule (five rating tiers, a non-empty list) the whole value falls
   back to the default. An entry in `RULES`
   ([settingsCodec.ts](../../src/modules/settings/domain/settingsCodec.ts)) only when what the value says must be
   checked or migrated.
3. A `Setting` or card in the matching `render*` of the tab, reading with `this.settings.get()` and writing with `await this.settings.update((s) => { s.x = … })` (or `stage` for text typed key by key; `flush` runs on unload). `update` persists once (`persistSettings`) and emits the change signal once; never save directly.
4. Synced across devices? Add the key to `SHARED_SETTING_KEYS` (or `NESTED_SHARED_KEYS` for
   reading/games). Never a secret. Default is device-local. A new key or credential goes into
   `SECRET_SETTINGS` ([SecretStore.ts](../../src/shared/storage/SecretStore.ts)) instead.
5. Needs a live effect? `update` already emits the change signal; nothing to call. Not a dispatch on
   `activeDocument`: the settings tab runs in its own window since Obsidian 1.15
   ([overview](../architecture/overview.md#the-change-signal)).
