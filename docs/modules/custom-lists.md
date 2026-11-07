---
type: Module
title: Custom Lists
description: How user-defined tables (Custom Lists tab) are stored as Markdown notes, edited inline and auto-filled with remaining watch time; where to change each part.
source:
  - src/CustomListsTab.ts
  - src/ui/ColumnsEditor.ts
  - src/storage/VaultLayout.ts
  - src/types.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Custom Lists

## Purpose / Boundary

Free-form tables the user defines (name + typed columns + rows) next to the typed libraries. A list is one Markdown note under `<root>/CustomLists/` ([VaultLayout.ts](../../src/storage/VaultLayout.ts): `FOLDERS.customLists`, `customListsFolder`). It is NOT part of the entry index: `VaultLayout` excludes this folder from entry classification (see [storage](../architecture/storage.md)), and lists have no entry id; CustomListsTab.ts itself references neither `hoard-data-changed` nor HistoryManager (HoardView-level re-render not verified). Column templates for new lists live in settings (`defaultCustomColumns`, shared via the base; see [shared vs local](../concepts/shared-vs-local.md)).

## Entry points

All in [CustomListsTab.ts](../../src/CustomListsTab.ts):
- `CustomListsTab` (tab registered in `HoardView`): `render()` lists `*.md` in the folder as sub-tabs, loads the active list, then `buildListView` -> `buildTable`.
- `CustomListManager`: all file IO (`listNames`, `loadList`, `saveList`, `saveNotes`, `deleteList`, `renameList`, id generators). Also instantiated by SettingsTab for `DefaultColumnsModal`.
- `EditColumnsModal` / `DefaultColumnsModal`: column editing, both rendered by `renderColumnsEditor` in [ColumnsEditor.ts](../../src/ui/ColumnsEditor.ts) (card list with drag reorder, per-column options, option colours).
- `NotesModal`, `ImportListModal` (paste TSV, mapping against current columns), export-to-clipboard (Markdown or TSV).

## How it works

### Persistence format
`serialize` writes the note as:
`# <name>` / `## Notes` (free text) / `## Data` with a fenced `json` block holding `{ columns, rows, tabColor, nameWidth }`. The JSON block is the source of truth; there is no real Markdown table and no properties block. `parse` regexes `## Notes` and the json block; filters malformed columns/rows (need `id`,`label`,`type` / `id`). On a JSON parse error the list name is put in `corruptLists`, a Notice shows, and `saveList` refuses to overwrite it. File name = list name; rename = vault rename. Tab order is `settings.customListTabOrder` (local), unknown names appended.
Saves are serialized per list (`saveQueues` in the manager) so table and notes writes cannot clobber each other; `saveNotes` rewrites only the `## Notes` section.

### Model (types.ts)
- `CustomListColumn`: `id` (`col_N`), `label`, `type: 'text' | 'number' | 'select'`, `locked`, `options` + `optionColors` (select), `bold`/`italic` (text/number), `autoTime` (number), `width`.
- `CustomListRow`: `id` (`row_N`), `checked`, `name` (built-in first column), plus one key per column id.
- `CustomList`: `name`, `columns`, `rows`, `notes`, `tabColor`, `nameWidth`.
Removing a column strips its key from all rows (EditColumnsModal save callback).

### Table and inline editing
`buildTable` renders div-based rows: tick column (select-all over visible rows), `#`, Name, one cell per non-`locked` column, actions. Search filters on name only; sort is a string compare on the chosen column (`getFilteredSortedRows`). Cells edit in place: text/number via an input, select via the shared status-style dropdown (`openSelectDropdown`). Tab / Shift+Tab / Enter commit and move (`navigateCell`, `addRowForNavigation` appends a row at the end), Escape cancels. Every commit calls `manager.saveList` (whole file rewrite). The Name editor autocompletes from all libraries (watch titles, books, manga, games) and rows can open the add-title flow via `openAddForTitle` (`AddRouter`). Column widths are draggable on desktop and persisted (`width`, `nameWidth`).

### Auto time column
A `number` column with `autoTime` is filled by `autoPopulateTimeColumn`: per row, exact match of the Name against a watchlist `title` (`DataManager.getTitles()`); no match writes the string `Not found`, else `DataManager.calcTimeRemainingForModal(title)` (unit: minutes per the variable name; calculation not verified). Runs after saving columns and on the header refresh button; it is not reactive to data changes. Only watch titles are matched, not books/games.

## Where to change what

| Change | Place |
|---|---|
| File format, parse/serialize, corrupt-file guard | `CustomListManager.parse` / `serialize` / `saveList` |
| Folder name | `FOLDERS.customLists` in VaultLayout.ts |
| Column types / properties | `CustomListColumn` in types.ts, ColumnsEditor.ts, `renderCustomCell` in CustomListsTab.ts |
| Inline editing, key navigation | `startNameEdit`, `navigateCell`, `handleEditKey` |
| Auto time logic | `autoPopulateTimeColumn` |
| Import/export | `ImportListModal`, `gatherExportData`, `buildMarkdown`, `buildTsv` |
| Default columns for new lists | `defaultCustomColumns` (settings), `DefaultColumnsModal` |

## Links
[storage](../architecture/storage.md), [ui-kit](../architecture/ui-kit.md), [settings](settings.md), [watchlist](watchlist.md).
