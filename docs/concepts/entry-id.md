---
type: Domain
title: Entry id
description: What an entry id is, how it maps to a note path, and what a rename does to it.
source:
  - src/storage/VaultLayout.ts
  - src/storage/EntryIndex.ts
  - src/DataManager.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Entry id

An entry id is **the note path relative to the Hoard root, without `.md`**: `Anime/Dark`,
`Books/Dune`, `Games/Hades`. There is no separate identifier; the file is the key.

- The root is the folder of the first path-sorted `.base` file holding a top-level `hoard:`
  block (`VaultLayout.findRoot`, `detectRoot` in [VaultLayout.ts](../../src/storage/VaultLayout.ts)).
  A fresh install uses `Hoard` until a base exists.
- `VaultLayout.classify(path)` decides whether a file is an entry and of which kind: exactly one
  folder below the root, `.md`, folder is `Books`/`Manga`/`Games` (fixed, see `FOLDERS`) or one of
  the watch type names from settings. Anything else (deeper paths, `CustomLists/`) is not an entry.
- `idFromPath` / `pathFromId` convert both ways; `notePath(kind, title, type)` builds the path for
  a new entry with `safeFileName` (unsafe characters, leading dots, Windows device names replaced).
  Managers add ` 2`, ` 3` suffixes for a free path before creating.

## Consequences

- **A title or type change renames the file**, and the id with it. `DataManager.writeTitle` renames
  first, then calls `moveId` to re-key per-id state; [EntryIndex](../../src/storage/EntryIndex.ts)
  follows vault `rename` events and moves the [entry cache](entry-cache.md) key via
  `LocalStore.renameCache`. History lines link `[[<id>]]`, so Obsidian updates them on rename.
- Moving a note out of the entry folders acts as a delete; moving one in acts as a create.
- Type names double as folder names, so `safeTypeName` / `typeNameError` reject names that collide
  with the fixed folders or are not valid folder names.
- A new title's provisional id from `generateId` is replaced by the real path in `createNote`.

Related: [architecture/storage](../architecture/storage.md), [flows/entry-write](../flows/entry-write.md).
