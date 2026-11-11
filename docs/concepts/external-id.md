---
type: Domain
title: External id
description: The External ID property, its source:kind:id grammar, and how it is derived from links and API ids.
source:
  - src/storage/externalId.ts
  - src/storage/titleCodec.ts
  - src/storage/readingCodec.ts
  - src/storage/gameCodec.ts
  - src/LibraryIndex.ts
source_commit: 554c087c9f4c7b4932c8b73a5b761c39fcc6846d
---

# External id

`External ID` is the **primary API identity of an entry**, stored in the note as one string so it
survives sync and hand edits: `source:id` or `source:kind:id`.

| Source | Kind required | Example |
|---|---|---|
| `tmdb` | `movie` / `tv` | `tmdb:tv:1396` |
| `mal`, `anilist` | `anime` / `manga` | `mal:anime:5114` |
| `imdb`, `gbooks`, `openlibrary`, `rawg`, `igdb`, `steam` | none | `imdb:tt0903747`, `openlibrary:OL45883W`, `steam:620` |

[externalId.ts](../../src/storage/externalId.ts): `parseExternalId` (null on unknown source,
missing kind, or an id outside `[\w-]+`), `formatExternalId`, and `externalIdFromLink` which derives
the identity from a pasted IMDb, TMDB, MyAnimeList or AniList URL, one small matcher per host
(`LINK_MATCHERS`). Only title sources derive from links: Open Library and Steam URLs are not matched,
since only titles call it and books and games carry their id in their own fields.

## Per kind

- **Titles** ([titleCodec](../../src/storage/titleCodec.ts)): on decode, `External ID` wins over cached
  ids and sets `tmdbId`+`tmdbMediaType`, `malId` or `anilistId`; an `imdb` id without a link
  synthesises `URL`. On encode, `identityFor` picks the first available in order
  MAL → AniList → TMDB for type `Anime`, TMDB → MAL → AniList otherwise, then falls back to the link.
- **Books**: `gbooks:<volumeId>`, mirrored into `Google Books ID`, or `openlibrary:OL…W` (model field
  `openLibraryId`, stored only here, no property of its own). A set Google id wins on encode, so an
  Open Library book given a Google id by hand switches to `gbooks:`.
- **Manga**: `mal:manga:<id>`, mirrored into `MAL ID`.
- **Games**: `rawg:<id>` / `igdb:<id>` / `steam:<appid>`, decoded into `apiSource` + `apiId` model fields (the older note properties of that name are read
  only by the WatchLog import, [properties](properties.md)). A Steam search pick also sets
  `Steam App ID`; that property stays separate and is what Steam sync matches on.

## Duplicate detection

[LibraryIndex.ts](../../src/LibraryIndex.ts) keys the library by the same vocabulary (`mal:`,
`anilist:`, `tmdb:<type>:`, `imdb:`, `gbooks:`, `openlibrary:`, `<source>:<id>` and `steam:<steamAppId>`
for games) plus a normalised title key, so an add modal can warn before creating a second note for
the same work. A movie/TV search row's keys depend on the effective source
(`mediaResultIdKeys(row, source)`: `tmdb:<type>:` under TMDB, `imdb:` under Cinemeta and OMDb). See
[flows/add-title](../flows/add-title.md).
