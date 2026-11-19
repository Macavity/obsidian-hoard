---
type: Domain
title: Entry id
description: What an entry id is, how it maps to a note path, and what a rename does to it.
source:
  - src/shared/storage/VaultLayout.ts
  - src/shared/storage/EntryIndex.ts
  - src/shared/storage/noteWrite.ts
  - src/shared/domain/typeName.ts
  - src/modules/watchlist/services/DataManager.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Entry id

An entry id is **the note path relative to the Hoard root, without `.md`**: `Anime/Dark`,
`Books/Dune`, `Games/Hades`. There is no separate identifier; the file is the key.

- The root is the folder of the first path-sorted `.base` file holding a top-level `hoard:`
  block (`VaultLayout.findRoot`, `detectRoot` in [VaultLayout.ts](../../src/shared/storage/VaultLayout.ts)).
  A fresh install uses `Hoard` (`DEFAULT_ROOT` in `app/main.ts`) until a base exists.
- `VaultLayout.classify(path)` decides whether a file is an entry and of which kind: exactly one
  folder below the root, `.md`, folder is `Books`/`Manga`/`Games` (fixed, `FOLDERS` in [typeName.ts](../../src/shared/domain/typeName.ts)) or one of
  the watch type names from settings. Anything else (deeper paths, `CustomLists/`) is not an entry.
- `idFromPath` / `pathFromId` convert both ways; `notePath(kind, title, type)` builds the path for
  a new entry with `safeFileName` (typeName.ts; unsafe characters, leading dots, Windows device names replaced).
  Managers add ` 2`, ` 3` suffixes for a free path before creating.

## Consequences

- **A title or type change renames the file**, and the id with it. The write pipeline (`writeEntry` in [noteWrite.ts](../../src/shared/storage/noteWrite.ts)) renames
  first (unless the target path exists: Notice, old name and id kept, properties still written),
  then calls `moveId` to re-key per-id state; [EntryIndex](../../src/shared/storage/EntryIndex.ts)
  follows vault `rename` events and moves the [entry cache](entry-cache.md) key via
  `LocalStore.renameCache`. The reading and game managers follow a rename the same way the watchlist does: `dropOldId` (via `moveId`) re-keys the id, the handed-out view and any pending (dirty) edit, so a pending edit survives a vault rename. History lines link `[[<id>]]`, so Obsidian updates them on rename.
- Moving a note out of the entry folders acts as a delete; moving one in acts as a create.
- Type names double as folder names, so `safeTypeName` / `typeNameProblem` (typeName.ts) reject names that collide
  with the fixed folders or are not valid folder names.
- A new title's provisional id from `generateId` is replaced by the real path in `createNote`.

Related: [architecture/storage](../architecture/storage.md), [flows/entry-write](../flows/entry-write.md).
