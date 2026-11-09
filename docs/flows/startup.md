---
type: Flow
title: Startup
description: What happens from plugin load to a ready library, including fresh install and second device.
source:
  - src/main.ts
  - src/storage/LocalStore.ts
  - src/storage/SharedConfigStore.ts
  - src/storage/VaultLayout.ts
  - src/storage/EntryIndex.ts
  - src/settingsSplit.ts
source_commit: 3cf70e7d99442c30c753b169d4da73e2ad38a964
---

# Startup

Trigger: Obsidian enables the plugin. Two phases in [main.ts](../../src/main.ts): `onload` runs
with only `data.json` (its first call is `setLocale(getLanguage())`, see [i18n](../architecture/i18n.md)), `startVaultStorage` runs once the workspace layout is ready (vault and
metadata cache usable).

```mermaid
sequenceDiagram
  participant P as HoardPlugin.onload
  participant L as LocalStore
  participant S as startVaultStorage
  participant Sh as SharedConfigStore
  participant I as EntryIndex
  participant Mg as managers
  P->>L: load() (own data.json)
  P->>P: loadSettings() from local + defaults
  P->>P: ApiService, history.load(), scheduler, view, commands, widgets, status bar
  Note over P,S: workspace.onLayoutReady
  S->>S: detectRoot() → VaultLayout
  alt no base
    S->>Sh: deferBase(create on first write, adopt when synced in)
  end
  S->>Sh: load(), applySharedSettings(), ensureFilter(), start()
  S->>I: build(), sweepCache(), start()
  S->>Mg: history.start(), DataManager/Reading/Game init(), ensureFolders()
```

## Steps

1. **`LocalStore.load`** reads Hoard's own `data.json`. A file from a newer plugin version makes
   the store read-only with a Notice; a WatchLog schema-1 file makes it start empty and read-only
   for the session ([import](../modules/import.md)).
2. **`loadSettings`** composes defaults + local (+ shared, empty for now) and mirrors the date
   format into `types.ts`; the card-size CSS variable is set before any grid renders.
3. Services and UI are registered: `ApiService` with the keys, managers get the `HistoryManager`,
   `History.md` is loaded, the 60 s airtime scheduler starts, view, commands, `WidgetRenderer`,
   settings tab and status bar are registered.
4. **`startVaultStorage`**: `detectRoot`. Root priority: a base with `hoard:` → `Hoard`.
5. **Fresh install** (no base): `deferBase` registers a creator; the base is
   written on the first user-initiated note write (`EntryIndex.onLocalWrite` → `ensureBase`) or
   the first changed shared setting, or adopted when a synced base appears (`adoptSyncedBase`: new layout, reload settings, rebuild
   index). This is what lets a second device start on a half-synced vault without becoming the
   first one.
6. Shared config loads and `applySharedSettings` re-composes settings; a missing
   `file.inFolder` filter in the base yields a Notice.
7. `EntryIndex.build` scans all notes, `sweepCache` drops cache entries without a note, then the
   index and history start following vault events. Each manager's `init` reads note bodies, hooks
   `index.onChange`, queues missing posters and seasons and notifies once.

## Failure points

- Any error in `startVaultStorage` is caught once: console error plus Notice "could not load its
  notes"; the UI stays up with whatever was loaded before the failure (an already built index is
  not cleared).
- Type-name changes after start trigger `syncTypeNames` → `index.rebuild()`.

Shutdown (`onunload`) flushes pending debounced note and cache writes synchronously, stops the
index and the shared store, and flushes `LocalStore` last.
