---
type: Module
title: Reading
description: How books and manga differ in model and progress, the release-status and custom-column rules, and where CSV and quotes live.
source:
  - src/modules/reading/exports.ts
  - src/modules/reading/domain/model.ts
  - src/modules/reading/services/roles.ts
  - src/modules/reading/domain/readingDefaults.ts
  - src/modules/reading/domain/newReading.ts
  - src/modules/reading/domain/readingColors.ts
  - src/modules/reading/services/ReadingDataManager.ts
  - src/modules/reading/domain/readingHelpers.ts
  - src/modules/reading/domain/progressLog.ts
  - src/shared/storage/readingCodec.ts
  - src/modules/reading/ui/ReadingTab.ts
  - src/modules/reading/ui/ReadingDetailModal.ts
  - src/modules/reading/ui/ReadingAddForm.ts
  - src/modules/reading/ui/readingAddProvider.ts
  - src/modules/reading/ui/ReadingManageColumnsModal.ts
  - src/modules/reading/ui/ReadingCsvModal.ts
  - src/modules/airtime/ui/ReadingScheduleModal.ts
  - src/shared/services/coverRefresh.ts
  - src/design-system/CsvModalBase.ts
source_commit: 5f7a103
---

# Reading

One note per book (`Books/`) or manga (`Manga/`). [exports.ts](../../src/modules/reading/exports.ts) is the module's
public surface (what other modules and `shared` may import); it only re-exports by name: the types (`domain/model.ts`) `Book`, `Manga`, `ReadingSettings`, `ReadingData`, `ReadingKind`, `OpenReadingCsv`, the roles (`services/roles.ts`)
`ReadingReader`, `ReadingWriter`, `ReadingSettingsAccess`, `ReadingSnapshot` (backup), plus the values
`READING_STATUSES`, `SELECTABLE_READING_STATUSES`, `DEFAULT_READING_SETTINGS`, `DEFAULT_READING_STATUS_COLORS`, `bookProgressUnit`,
`getReadingTypeColor` (`domain/readingDefaults.ts`), `readingStatusColor` (`domain/readingColors.ts`) and `newBook` / `newManga` (`domain/newReading.ts`).
`coverFallbackColor` is module-internal (`domain/coverColor.ts`).
[ReadingDataManager.ts](../../src/modules/reading/services/ReadingDataManager.ts) `implements` the four roles and
owns the copies, writes, history and Upcoming sync; the dialogs and the tab are built in
[wiring/reading.ts](../../src/app/wiring/reading.ts); [readingCodec.ts](../../src/shared/storage/readingCodec.ts)
maps properties to `Book` / `Manga`. Writes follow [flows/entry-write](../flows/entry-write.md)
(`writeItem`, `afterWrite`, [baseline](../concepts/baseline.md)); the UI is
[ReadingTab.ts](../../src/modules/reading/ui/ReadingTab.ts) (sub-tabs books/manga, shelves, virtual grid),
[readingAddProvider.ts](../../src/modules/reading/ui/readingAddProvider.ts) and [ReadingAddForm.ts](../../src/modules/reading/ui/ReadingAddForm.ts) (the book and manga side of the [add wizard](add.md): Open Library or Google Books for books via `searchBooks`, MAL via Jikan for manga; a pasted MyAnimeList or AniList manga link resolves directly),
[ReadingDetailModal.ts](../../src/modules/reading/ui/ReadingDetailModal.ts), [ReadingManageColumnsModal.ts](../../src/modules/reading/ui/ReadingManageColumnsModal.ts)
and the CSV modals opened from the settings tab. `ReadingCsvModal` and the watchlist's `CsvModal` both extend
[CsvModalBase.ts](../../src/design-system/CsvModalBase.ts), which owns the wizard (export selection, upload, header
mapping, value mapping, duplicate preview, batch import); subclasses supply fields, labels and `doImport`.

Vault renames: `moveId` calls `dropOldId`, which re-keys the view and the pending edit, so an edit not yet written survives a rename ([entry id](../concepts/entry-id.md)).

## Model

- Common: `Name`, `Author`, `Status`, `Rating`, favourite, start/finish/release dates,
  `Cover`, `URL`, `Groups`, airtime properties, `Custom <name>` custom fields, `Type: book|manga`; names in
  [properties](../concepts/properties.md).
- Status: `Reading | Completed | Plan to Read | To be released | Dropped`; "To be released" is
  never user-selectable. An unknown stored status decodes to "Plan to Read" and is flagged invalid.
- **Book** progress unit is `pages` (default) or `words` (`Progress Unit`); both counter pairs are
  stored, `bookUnitProgress` (`domain/readingHelpers.ts`) picks the active one, and word properties are written only when the
  unit is words or a word count is non-zero. Also chapters, `Google Books ID` and `openLibraryId`
  (an Open Library work id `OL…W`; no property of its own, only `External ID`).
- **Manga**: chapters and volumes, `MAL ID` (a number). Card progress uses chapters only.
- Ids: `gbooks:` / `openlibrary:` / `mal:manga:` in `External ID` ([external id](../concepts/external-id.md)).

## Rules worth knowing

- **Release status**: a future `releaseDate` forces "To be released"; once past or cleared the
  status reverts to "Plan to Read", not to the configured default. `syncUpcoming` mirrors the
  entry into Upcoming only when the release date changed; `init()` reconciles all future-dated
  items ([upcoming](upcoming.md)).
- **Auto-complete** happens in the detail modal on close: when the active unit (books, or
  chapters) or manga chapters reach a non-zero total, status becomes Completed and `dateFinished`
  is stamped.
- **Custom columns**: definitions (`id`, `name`, `type` text/number/select, options, colour) are
  shared config (`bookColumns` / `mangaColumns`); values live in each note as `Custom <column name>` and in memory by column id
  (`customFields`). The codec takes the kind's column list; `EntryIndex.setColumns` re-decodes reading
  notes when a name changes. Renaming a column moves the key in all notes of the kind
  (`ReadingDataManager.updateColumn`, notes first, then the setting); names are unique per kind, ignoring
  case. Removing a column and the full rewrite never delete values. Columns are not part of CSV.
  The values of a deleted column stay in the notes and reappear when a column with the same name is created
  again. If one device renames a column while another edits that field before the base has synced, the edit
  can end up under the old key (`Custom <old>`); nothing is lost.
- **Quotes** are not indexed: the detail modal parses `## Quotes` for `> [!quote] <reference>`
  callouts; `appendQuote` inserts newest first and creates the section when missing.
- **Book search** is keyless: `searchBooks` ([coverRefresh.ts](../../src/shared/services/coverRefresh.ts), injected as `searchBooks`) uses
  Google Books when `booksApiSource` is `google` and a key is set, else Open Library
  ([api layer](../architecture/api-layer.md)); there is no "key required" panel. A pick sets
  `googleBooksId` or `openLibraryId`, then a background `enrichBook` fetches the full record: Google
  upgrades pages and cover, Open Library fills only an empty cover (the work record carries no author, pages or date, and a
  value typed meanwhile must win). Search rows from Open Library often have no page count.
- **Covers**: cards without a cover fetch lazily by id (Open Library work or Google volume), else by
  title (+ author) search through `searchBooks`, taking the first hit that has a cover and an id
  (`firstBookCover`); only the cover is persisted and only when empty. Bulk refresh needs an id; a
  Google-only book also needs the key, an Open Library book does not. The "Google Books ID" field of
  the detail modal stays Google-only: it neither shows nor edits `openLibraryId`.
- **CSV**: fixed export columns per kind (no custom fields, cover or groups). Import = upload,
  header mapping by aliases, value mapping for unknown statuses and ratings, duplicate preview
  (same title, case-insensitive, deselected), then batches of 10. Ambiguous `a/b/yyyy` dates read
  as DD/MM (`parseCsvDate`). A book CSV with only word counts becomes unit `words`.
- **Settings split**: `defaultStatus`, `bookColumns`, `mangaColumns` sync; colours, layouts,
  saved filters and default sub-tab stay local ([shared vs local](../concepts/shared-vs-local.md)).

## Where to change what

| Change | Place |
|---|---|
| Property names, defaults when reading a note, validation | `readingCodec.ts` |
| Defaults of a new book or manga | `newBook`, `newManga` in [newReading.ts](../../src/modules/reading/domain/newReading.ts); the WatchLog import keeps its own |
| Status list and colours | `READING_STATUSES`, `DEFAULT_READING_STATUS_COLORS` in `domain/readingDefaults.ts`, `readingStatusColor` in `domain/readingColors.ts` |
| Anything other modules or `shared` import from reading | `exports.ts`; the changed surface goes through the `exports-reviewer` agent (`.claude/agents/exports-reviewer.md`) before it is committed |
| Rows shelf ids | `READING_ROWS_SHELVES` in `domain/readingHelpers.ts` |
| Release and Upcoming rules | `applyReleaseStatus`, `syncUpcoming` in the manager |
| Auto-complete | `applyAutoComplete` in `ReadingDetailModal.ts` |
| History lines for changed progress counters (book: only the tracked unit; chapters; manga chapters and volumes; none when the total is 0) | `progressLogLines` in [progressLog.ts](../../src/modules/reading/domain/progressLog.ts) on a `ReadingItemRef` (`domain/model.ts`); the modal's `logProgressChange` writes them |
| CSV fields and aliases | `*_EXPORT_COLUMNS`, `*_IMPORT_FIELDS` in `ReadingCsvModal.ts`; wizard steps in `design-system/CsvModalBase.ts`; dates in `csvCore.ts` |
| Quotes format | `parseQuotesSection` (modal), `appendQuote` (manager) |
