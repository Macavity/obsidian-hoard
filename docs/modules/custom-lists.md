---
type: Module
title: Custom lists
description: How a custom list is stored as a note with a JSON block, what a column and a row are, and how the auto time column is filled.
source:
  - src/modules/custom-lists/domain/customList.ts
  - src/modules/custom-lists/services/CustomListManager.ts
  - src/modules/custom-lists/ui/CustomListsTab.ts
  - src/app/wiring/customLists.ts
  - src/design-system/ColumnsEditor.ts
  - src/shared/domain/columns.ts
  - src/shared/services/addRoute.ts
  - src/shared/storage/VaultLayout.ts
source_commit: 4c5ff3ab895535b09f6d6ba5a885a7bf887ffb16
---

# Custom lists

Free-form tables (name, typed columns, rows) beside the typed libraries. A list is one note under
`<root>/CustomLists/`; the folder is excluded from entry classification, so lists have no
[entry id](../concepts/entry-id.md), no codec and no place in `EntryIndex`. Three files:
[CustomListManager.ts](../../src/modules/custom-lists/services/CustomListManager.ts) (all vault I/O; the UI gets an
instance through the `CreateListManager` factory, also used by the settings tab for default columns),
[CustomListsTab.ts](../../src/modules/custom-lists/ui/CustomListsTab.ts) (the tab, `EditColumnsModal` /
`DefaultColumnsModal`, both rendering [ColumnsEditor.ts](../../src/design-system/ColumnsEditor.ts), `NotesModal`,
`ListNameModal`, `ImportListModal` (paste TSV), `ExportFormatModal` and clipboard export (Markdown or TSV)) and
[customList.ts](../../src/modules/custom-lists/domain/customList.ts) (`CustomList`, types only, module-internal: no `exports/` folder; column and row types are
in [columns.ts](../../src/shared/domain/columns.ts)). [wiring/customLists.ts](../../src/app/wiring/customLists.ts)
is the only place that `new`s the dialogs and the tab; the tab types its data sources against
`TitleReader` / `TitleStats` / `ReadingReader` / `GameReader` roles.

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
rename. Saves are serialised per list so table and notes writes cannot clobber each other.
`saveList` replaces only the `## Data` block (appends one if missing) and `saveNotes` only the
`## Notes` body (adding the heading before `## Data` if the note has none), both through
`vault.process`, never a separate read and modify; title, notes and any hand-written sections stay as they are on disk. A new list
is created with the full format. Tab order is the device-local `customListTabOrder`; default
columns for new lists are the shared `defaultCustomColumns`.

## Foreign edits

The same idea as the entries' [baseline](../concepts/baseline.md), per list object:
`CustomListManager` keeps, in a `WeakMap`, the stored state (data JSON + notes) each in-memory
`CustomList` was loaded from or last written as.

- Every write runs inside `vault.process` (`writeChecked`): if the note no longer holds that
  state, nothing is written and `onConflict` fires. The tab then shows
  `lists.changedElsewhere` and reloads the list; the user's last change is dropped, the foreign
  one kept. A list that has a baseline but no file any more (deleted or renamed elsewhere) is
  not recreated.
- The guard parses the note quietly: invalid JSON (a hand edit between two keystrokes) counts
  as a conflict for a save but neither marks the list corrupt nor shows `lists.corrupt`, and does
  not trigger a reload. A successful `loadList` clears the corrupt mark.
- A refused notes save keeps `NotesModal` open with the typed text; a notes save into a deleted
  note is reported like a table save.
- Because the baseline sits on the object, a save still queued from a copy made before a reload
  also meets the old baseline and is refused.
- The tab listens to vault `modify` for the open list's note and reloads when `isStale` holds,
  or, if no list is shown because the note was corrupt, once `peek` parses it again.
  Own writes move the baseline inside the `process` callback, so they never count as stale. An
  open cell editor (`.hoard-custom-list-table__td--editing`) blocks the reload; its commit then hits the conflict
  path. `destroy` (view close, tab switch) drops the listener; `render` only tears down the
  inline editor.
- Rejected: a row-level three-way merge. Row ids are sequential (`row_N`), so two devices adding
  rows collide on ids, and two edits of the same cell need a rule that drops one of them anyway.
  Reload + notice keeps every foreign change at the cost of one local edit, and the `modify`
  reload makes that window short.

## Model

- `CustomListColumn` (`columns.ts`): `id` (`col_N`), `label`, `type` text / number / select, `locked`,
  `options` + `optionColors`, `bold` / `italic`, `autoTime`, `width`.
- `CustomListRow` (`columns.ts`): `id` (`row_N`), `checked`, `name` (built-in first column), one key per column id.
  Removing a column strips its key from every row.

## Behaviour

- Cells edit in place; every commit rewrites the `## Data` block through `saveList`. The name editor
  autocompletes from all libraries, and a row can open the add flow via the injected `openAdd`
  (`OpenAddRoute`, built from `createAddRoute` in `app/AddRouter.ts`), shared with [drafts](drafts.md).
- **Auto time column**: a number column with `autoTime` is filled by `autoPopulateTimeColumn`:
  exact match of the row name against watchlist titles, then `TitleStats.calcTimeRemainingForModal` (the watchlist manager);
  no match writes the string `Not found`; rows with an empty name are skipped and keep their value. Runs after saving columns and on the header refresh
  button, not on data changes. Books and games are not matched.
- Name-cell editor: while open, a document-level capture guard swallows Escape so it never closes the view or modal. Escape keydown on the input itself passes the guard: it closes the suggestion dropdown if open, otherwise cancels the edit without saving (`handleEditKey`).
- Search filters on the name only; sort is a string compare on the chosen column.

## Where to change what

| Change | Place |
|---|---|
| File format, corrupt-file guard | `CustomListManager.parse` / `serialize` / `saveList`, `replaceDataBlock` / `replaceNotes` |
| Foreign-edit guard | `CustomListManager.writeChecked` / `isStale`, `CustomListsTab.onVaultModify` / `onSaveConflict` |
| Column types | `CustomListColumn` in `shared/domain/columns.ts`, `ColumnsEditor.ts`, `renderCustomCell` |
| Inline editing and key navigation | `startNameEdit`, `handleEditKey`; where Tab / Shift+Tab / Enter lead is the pure `cellNavTarget`, `navigateCell` only clicks the target |
| Auto time | `autoPopulateTimeColumn` |
| Import and export | `ImportListModal`, `gatherExportData`, `buildMarkdown`, `buildTsv` |
