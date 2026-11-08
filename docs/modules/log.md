---
type: Module
title: Log
description: What the activity log records, how the Log tab and the Recently Watched shelf read it, and where to change the wording.
source:
  - src/HistoryManager.ts
  - src/storage/HistoryStore.ts
  - src/storage/historyLine.ts
  - src/LogTab.ts
  - src/DataManager.ts
source_commit: d4cf7e39e4fc24687cf810e7417d26726e840ee6
---

# Log

A unified timeline of what the user adds, finishes, rates, deletes or groups, across Watchlist,
Reading and Games. Stored in `<root>/History.md` ([history line](../concepts/history-line.md)),
synced like any note.

## Ownership

| Piece | File | Role |
|---|---|---|
| `HistoryManager` | [HistoryManager.ts](../../src/HistoryManager.ts) | in-memory entries (max 1000), `log()`, `deleteEntry`, `restore`, change listeners |
| `HistoryStore` | [HistoryStore.ts](../../src/storage/HistoryStore.ts) | file I/O: parse, append, replace, cap; ignores own writes |
| `LogTab` | [LogTab.ts](../../src/LogTab.ts) | virtualised timeline grouped by day, source filter, per-entry delete |
| callers | `DataManager`, `ReadingDataManager`, `GameDataManager` | `logChanges`, `logCompleted`, `logEpisodeWatched` and the add/delete/group paths |

## How it works

- Managers call `historyManager.log(message, { source, action, titleName, titleId })`. The message
  is human text; `source` and `action` are the structured fields the tab renders from. Older
  entries without them are classified by `inferHistoryAction` / `inferHistorySource` (message
  parsing, default Watchlist).
- `log` is optimistic: the entry is in `getEntries()` at once; ids are rewritten on the next load
  from the file (`<timestamp>#<line>`). Write errors are swallowed.
- `HistoryManager.start()` loads `History.md` and subscribes to the store's external-change
  watcher; listeners (`LogTab`, the Watchlist Rows view) re-render on reload.
- `resolveRecentlyWatched(entries, titles)` feeds the "Recently watched" shelf: Watchlist
  `watched`/`completed` entries, resolved by id, shortened link basename or name, deduped.
- `LogTab` renders rows virtually (spacer + viewport, `ResizeObserver`), colours the leading dot by
  source and the label by action, and extracts details (episode, page, rating) from the message with
  regexes in `actionLabel`.

## Where to change what

- Wording of an event: the manager that logs it; the tab's `actionLabel` regexes must still match.
- A new action: `HistoryAction` in `HistoryManager.ts`, `ACTIONS` in `historyLine.ts`,
  `ACTION_COLORS` and `actionLabel` in `LogTab.ts`.
- Cap or format: `MAX_HISTORY_ENTRIES` in the store, `MAX_ENTRIES` in the manager, `historyLine.ts`.
