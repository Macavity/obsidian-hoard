---
type: Module
title: Reading
description: How books and manga are modelled, written to notes, imported/exported, and where to change reading behaviour.
source:
  - src/ReadingDataManager.ts
  - src/storage/readingCodec.ts
  - src/ReadingTab.ts
  - src/ReadingDetailModal.ts
  - src/AddReadingModal.ts
  - src/ReadingManageColumnsModal.ts
  - src/ReadingCsvModal.ts
  - src/ReadingScheduleModal.ts
  - src/csv/csvCore.ts
  - src/storage/SharedConfigStore.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Reading (books and manga)

## Purpose / Boundary

One note per book (`Books/`) or manga (`Manga/`); the entry id is the note path (see [storage](../architecture/storage.md), [entry-id](../concepts/entry-id.md)). [ReadingDataManager.ts](../../src/ReadingDataManager.ts) owns in-memory views, writes, history logging and Upcoming sync. Decoding is [readingCodec.ts](../../src/storage/readingCodec.ts) (`decodeBook/Manga`, `encodeBook/Manga`); `EntryIndex` never writes. Everything else here is UI.

## Entry points

- Tab: [ReadingTab.ts](../../src/ReadingTab.ts) (sub-tabs `books`/`manga`, filter/sort popovers, selection mode, Rows shelves `favorites`, `recentlyAdded`, `recentlyRead`, `recentlyReleased`, `byStatus`; virtual grid).
- Add/edit: [AddReadingModal.ts](../../src/AddReadingModal.ts) (lookup: Google Books for books, needs API key; Jikan/MAL for manga).
- Detail: [ReadingDetailModal.ts](../../src/ReadingDetailModal.ts) (progress, details, custom fields, quotes).
- Columns: [ReadingManageColumnsModal.ts](../../src/ReadingManageColumnsModal.ts) (gear button in the toolbar).
- Schedule: [ReadingScheduleModal.ts](../../src/ReadingScheduleModal.ts), opened from `AirtimeTab.ts` (Upcoming), see [upcoming](upcoming.md).
- CSV: `ReadingCsvChoiceModal` (Books or Manga) then `ReadingCsvModal`, both opened from `SettingsTab.ts`.

## Model

- Shared: `title`, `author`, `status`, `rating`, `favorite`/`dateFavorited`, `dateStarted/Finished`, `releaseDate`, `dateAdded/Modified`, `coverUrl`, `externalLink`, `groups`, airtime props, `cf_*`, `type: book|manga`.
- Status: `Reading | Completed | Plan to Read | To be released | Dropped` (`READING_STATUSES`); `To be released` is not user-selectable (`SELECTABLE_READING_STATUSES`). Unknown stored status decodes to `Plan to Read` and is recorded as an invalid field.
- Book: progress unit `pages` (default) or `words` (`progressUnit`); both counter pairs are stored side by side, `bookUnitProgress` picks the active pair. Words props are only written when unit is words or a word count is non-zero. Also `chaptersRead/totalChapters`, `googleBooksId` (written with `externalId`).
- Manga: `chaptersRead/totalChapters`, `volumesRead/totalVolumes`, `malId` (with `externalId`).
- Progress percentage on cards: book = active unit, manga = chapters only.
- Auto-complete (detail modal, on close with changed progress): status becomes `Completed` when the active unit (books: or chapters) or manga chapters reach a non-zero total; `dateFinished` is then stamped today.

## How it works

**Release status.** `applyReleaseStatus`: future `releaseDate` forces `To be released`; once past or cleared it reverts to `Plan to Read` (not the default status). Applied in add, update, silent update and when a view is built. `syncUpcoming` adds/removes the entry in the shared Upcoming tracker only when the release date changed; `init()` additively reconciles all future-dated items. See [upcoming](upcoming.md), [airtime](../concepts/airtime.md).

**Writes** (details: [entry-write](../flows/entry-write.md), [baseline](../concepts/baseline.md)). `getBooks/getManga` hand out one mutable view per id (`viewOf`), stamped with the index entry as baseline. `writeItem` renames the note on title change (notice and keeps old name if target exists), encodes baseline vs item and sets/deletes only changed keys through `processFrontMatter`; `afterWrite` updates the index optimistically inside that callback. `createNote` picks a free path (`name 2.md`, ...), writes properties plus body `## Notes` / `## Quotes`. Silent updaters (`updateBookSilent`, ...) mark the id dirty and `saveAndNotify` writes it; `setFavorite` writes without `dateModified`. Covers: `updateCoverUrl` fills only an empty `coverUrl`, no notify. `rewriteFrontmatterIfExists` is the bulk full rewrite (keeps fields the decoder could not read).

**Custom columns.** `ReadingCustomColumn {id, name, type text|number|select, options, color}` per kind; id is `col-<slug>`. Definitions live in the shared config (`bookColumns`/`mangaColumns`), values in each note as `cf_<columnId>` (string or number; other `cf_` values count as invalid). `removeColumn` deletes the value from every note. Not part of CSV export/import.

**Quotes.** Read from the note body, not the index: the detail modal parses `## Quotes` for `> [!quote] <reference>` callouts (`parseQuotesSection`). `appendQuote` inserts a new callout directly under the heading (newest first), creating the section if missing.

**CSV.** Export columns per kind are fixed lists (`BOOK_EXPORT_COLUMNS`, `MANGA_EXPORT_COLUMNS`); no custom fields, cover or groups. Import steps: upload, header mapping (auto-detect by header aliases), value-mapping for unknown statuses / non-numeric ratings, preview with duplicates (same title, case-insensitive; deselected by default), then chunks of 10 via `addBookBatch`/`addMangaBatch` (cancellable). Imported items get empty `coverUrl`, default status from settings, dates parsed by `parseCsvDate` in [csvCore.ts](../../src/csv/csvCore.ts) (ambiguous `a/b/yyyy` is read as DD/MM); covers resolve lazily later. For books a CSV with only word counts becomes unit `words`.

**Cover resolution.** `ReadingTab.handleCoversVisible` lazily fetches for cards without cover: by `googleBooksId` / `malId`, else title search taking the first result; only the cover is persisted. Manual refresh and bulk refresh need the id (`fetchReadingCoverById` in `coverRefresh.ts`). See [api-layer](../architecture/api-layer.md).

## Settings split

`ReadingSettings` is split by `splitNested('reading', ...)` in [SharedConfigStore.ts](../../src/storage/SharedConfigStore.ts): shared (`Hoard.base`) = `defaultStatus`, `bookColumns`, `mangaColumns`; everything else (`statusColors`, `rowsLayout`, `savedFilters`, `defaultSubTab`, custom-field styles) goes to `data.json`; `defaultFolder` is dropped. `readShared()` merges local then shared. `setFinishDateAutomatically` is a global shared setting, not under `reading`. See [shared-vs-local](../concepts/shared-vs-local.md), [settings](settings.md).

## Where to change what

| Change | Place |
|---|---|
| Property names, defaults, validation | `readingCodec.ts` (+ `COMMON_KEYS`/`KIND_KEYS` in the manager) |
| Status list, colours | `READING_STATUSES`, `DEFAULT_READING_STATUS_COLORS` in `types.ts`; `readingColors.ts` |
| Release/Upcoming rules | `applyReleaseStatus`, `syncUpcoming` |
| Auto-complete | `applyAutoComplete` in `ReadingDetailModal.ts` |
| CSV fields/aliases | `*_EXPORT_COLUMNS`, `*_IMPORT_FIELDS` in `ReadingCsvModal.ts`; date formats in `csvCore.ts` |
| Backup/restore | `exportSnapshot`/`restore` (existing note with same title is kept) |
| Quotes format | `parseQuotesSection` (modal), `appendQuote` (manager) |

## Links

[storage](../architecture/storage.md) · [api-layer](../architecture/api-layer.md) · [entry-write](../flows/entry-write.md) · [add-title](../flows/add-title.md) · [entry-id](../concepts/entry-id.md) · [external-id](../concepts/external-id.md) · [baseline](../concepts/baseline.md) · [shared-vs-local](../concepts/shared-vs-local.md) · [upcoming](upcoming.md) · [import](import.md)
