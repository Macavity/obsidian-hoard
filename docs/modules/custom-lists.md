---
type: Module
title: Custom lists
description: How a custom list is stored as a note with a JSON block, what a column and a row are, and how the auto time column is filled.
source:
  - src/CustomListsTab.ts
  - src/ui/ColumnsEditor.ts
  - src/storage/VaultLayout.ts
  - src/types.ts
source_commit: 89be701597836592a0ea6243d561604a1a62bc5f
---

# Custom lists

Free-form tables (name, typed columns, rows) beside the typed libraries. A list is one note under
`<root>/CustomLists/`; the folder is excluded from entry classification, so lists have no
[entry id](../concepts/entry-id.md), no codec and no place in `EntryIndex`. Everything lives in
[CustomListsTab.ts](../../src/CustomListsTab.ts): the tab, `CustomListManager` (all file I/O,
also used by the settings tab for default columns), `EditColumnsModal` / `DefaultColumnsModal`
(both render [ColumnsEditor.ts](../../src/ui/ColumnsEditor.ts)), `NotesModal`, `ImportListModal`
(paste TSV) and clipboard export (Markdown or TSV).

## File format

````
# <name>
## Notes
<free text>
## Data
```json
{ "columns": [...], "rows": [...], "tabColor": "...", "nameWidth": 0 }
```
````

The JSON block is the source of truth; there is no Markdown table and no properties block.
`parse` drops columns and rows that lack required keys (presence only, values are not
type-checked); a JSON parse error puts the list into `corruptLists`,
shows a Notice, and `saveList` refuses to overwrite it. File name = list name, rename = vault
rename. Saves are serialised per list so table and notes writes cannot clobber each other;
`saveNotes` rewrites only the `## Notes` section. Tab order is the device-local
`customListTabOrder`; default columns for new lists are the shared `defaultCustomColumns`.

## Model

- `CustomListColumn`: `id` (`col_N`), `label`, `type` text / number / select, `locked`,
  `options` + `optionColors`, `bold` / `italic`, `autoTime`, `width`.
- `CustomListRow`: `id` (`row_N`), `checked`, `name` (built-in first column), one key per column id.
  Removing a column strips its key from every row.

## Behaviour

- Cells edit in place; every commit rewrites the whole file through `saveList`. The name editor
  autocompletes from all libraries, and a row can open the add flow via `openAddForTitle`
  (`AddRouter`), shared with [drafts](drafts.md).
- **Auto time column**: a number column with `autoTime` is filled by `autoPopulateTimeColumn`:
  exact match of the row name against watchlist titles, then `DataManager.calcTimeRemainingForModal`;
  no match writes the string `Not found`; rows with an empty name are skipped and keep their value. Runs after saving columns and on the header refresh
  button, not on data changes. Books and games are not matched.
- Search filters on the name only; sort is a string compare on the chosen column.

## Where to change what

| Change | Place |
|---|---|
| File format, corrupt-file guard | `CustomListManager.parse` / `serialize` / `saveList` |
| Column types | `CustomListColumn` in `types.ts`, `ColumnsEditor.ts`, `renderCustomCell` |
| Inline editing and key navigation | `startNameEdit`, `navigateCell`, `handleEditKey` |
| Auto time | `autoPopulateTimeColumn` |
| Import and export | `ImportListModal`, `gatherExportData`, `buildMarkdown`, `buildTsv` |
