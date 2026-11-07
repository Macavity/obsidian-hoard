---
type: Module
title: Reading
description: How books and manga differ in model and progress, the release-status and custom-column rules, and where CSV and quotes live.
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
  - src/coverRefresh.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Reading

One note per book (`Books/`) or manga (`Manga/`). [ReadingDataManager.ts](../../src/ReadingDataManager.ts)
owns the copies, writes, history and Upcoming sync; [readingCodec.ts](../../src/storage/readingCodec.ts)
maps properties to `Book` / `Manga`. Writes follow [flows/entry-write](../flows/entry-write.md)
(`writeItem`, `afterWrite`, [baseline](../concepts/baseline.md)); the UI is
[ReadingTab.ts](../../src/ReadingTab.ts) (sub-tabs books/manga, shelves, virtual grid),
[AddReadingModal.ts](../../src/AddReadingModal.ts) (Google Books for books, MAL via Jikan for manga),
[ReadingDetailModal.ts](../../src/ReadingDetailModal.ts), [ReadingManageColumnsModal.ts](../../src/ReadingManageColumnsModal.ts)
and the CSV modals opened from the settings tab.

## Model

- Common: `title`, `author`, `status`, `rating`, favourite, start/finish/release dates,
  `coverUrl`, `externalLink`, `groups`, airtime properties, `cf_*` custom fields, `type: book|manga`.
- Status: `Reading | Completed | Plan to Read | To be released | Dropped`; "To be released" is
  never user-selectable. An unknown stored status decodes to "Plan to Read" and is flagged invalid.
- **Book** progress unit is `pages` (default) or `words` (`progressUnit`); both counter pairs are
  stored, `bookUnitProgress` picks the active one, and word properties are written only when the
  unit is words or a word count is non-zero. Also chapters and `googleBooksId`.
- **Manga**: chapters and volumes, `malId`. Card progress uses chapters only.
- Ids: `gbooks:` / `mal:manga:` in `externalId` ([external id](../concepts/external-id.md)).

## Rules worth knowing

- **Release status**: a future `releaseDate` forces "To be released"; once past or cleared the
  status reverts to "Plan to Read", not to the configured default. `syncUpcoming` mirrors the
  entry into Upcoming only when the release date changed; `init()` reconciles all future-dated
  items ([upcoming](upcoming.md)).
- **Auto-complete** happens in the detail modal on close: when the active unit (books, or
  chapters) or manga chapters reach a non-zero total, status becomes Completed and `dateFinished`
  is stamped.
- **Custom columns**: definitions (`id`, `name`, `type` text/number/select, options, colour) are
  shared config (`bookColumns` / `mangaColumns`); values live in each note as `cf_<columnId>`.
  Removing a column deletes the value from every note. Columns are not part of CSV.
- **Quotes** are not indexed: the detail modal parses `## Quotes` for `> [!quote] <reference>`
  callouts; `appendQuote` inserts newest first and creates the section when missing.
- **Covers**: cards without a cover fetch lazily by id, else by title search taking the first
  result; only the cover is persisted and only when empty. Bulk refresh needs an id
  (`fetchReadingCoverById`).
- **CSV**: fixed export columns per kind (no custom fields, cover or groups). Import = upload,
  header mapping by aliases, value mapping for unknown statuses and ratings, duplicate preview
  (same title, case-insensitive, deselected), then batches of 10. Ambiguous `a/b/yyyy` dates read
  as DD/MM (`parseCsvDate`). A book CSV with only word counts becomes unit `words`.
- **Settings split**: `defaultStatus`, `bookColumns`, `mangaColumns` sync; colours, layouts,
  saved filters and default sub-tab stay local ([shared vs local](../concepts/shared-vs-local.md)).

## Where to change what

| Change | Place |
|---|---|
| Property names, defaults, validation | `readingCodec.ts` |
| Status list and colours | `READING_STATUSES`, `DEFAULT_READING_STATUS_COLORS` in `types.ts`, `readingColors.ts` |
| Release and Upcoming rules | `applyReleaseStatus`, `syncUpcoming` in the manager |
| Auto-complete | `applyAutoComplete` in `ReadingDetailModal.ts` |
| CSV fields and aliases | `*_EXPORT_COLUMNS`, `*_IMPORT_FIELDS` in `ReadingCsvModal.ts`; dates in `csvCore.ts` |
| Quotes format | `parseQuotesSection` (modal), `appendQuote` (manager) |
