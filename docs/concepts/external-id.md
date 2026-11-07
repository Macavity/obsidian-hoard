---
type: Domain
title: External id
description: The externalId property, its source:kind:id grammar, and how it is derived from links and API ids.
source:
  - src/storage/externalId.ts
  - src/storage/titleCodec.ts
  - src/storage/readingCodec.ts
  - src/storage/gameCodec.ts
  - src/LibraryIndex.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# External id

`externalId` is the **primary API identity of an entry**, stored in the note as one string so it
survives sync and hand edits: `source:id` or `source:kind:id`.

| Source | Kind required | Example |
|---|---|---|
| `tmdb` | `movie` / `tv` | `tmdb:tv:1396` |
| `mal`, `anilist` | `anime` / `manga` | `mal:anime:5114` |
| `imdb`, `gbooks`, `rawg`, `igdb` | none | `imdb:tt0903747`, `rawg:3498` |

[externalId.ts](../../src/storage/externalId.ts): `parseExternalId` (null on unknown source,
missing kind, or an id outside `[\w-]+`), `formatExternalId`, and `externalIdFromLink` which derives
the identity from a pasted IMDb, TMDB, MyAnimeList or AniList URL.

## Per kind

- **Titles** ([titleCodec](../../src/storage/titleCodec.ts)): on decode, `externalId` wins over cached
  ids and sets `tmdbId`+`tmdbMediaType`, `malId` or `anilistId`; an `imdb` id without a link
  synthesises `externalLink`. On encode, `identityFor` picks the first available in order
  MAL → AniList → TMDB for type `Anime`, TMDB → MAL → AniList otherwise, then falls back to the link.
- **Books**: `gbooks:<volumeId>`, mirrored into `googleBooksId`.
- **Manga**: `mal:manga:<id>`, mirrored into `malId`.
- **Games**: `rawg:<id>` / `igdb:<id>`, decoded into `apiSource` + `apiId` (older notes use those two
  properties directly).

## Duplicate detection

[LibraryIndex.ts](../../src/LibraryIndex.ts) keys the library by the same vocabulary
(`mal:`, `anilist:`, `tmdb:<type>:`, `imdb:`, `gbooks:`, `<source>:<id>` for games) plus a normalised
title key, so an add modal can warn before creating a second note for the same work. See
[flows/add-title](../flows/add-title.md).
