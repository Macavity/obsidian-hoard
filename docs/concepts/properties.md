---
type: Domain
title: Property names
description: The fixed Title Case property names of entry notes per medium, the naming rules, the older camelCase names, and the stability rule from 1.0.
source:
  - src/shared/storage/properties.ts
  - guide/migrate-notes/watchlog.md
  - src/shared/domain/sourceType.ts
source_commit: 07539c0
---

# Property names

Every entry field lives in a note property ([storage](../architecture/storage.md)). The names are
constants in [properties.ts](../../src/shared/storage/properties.ts) (`COMMON_PROPS`, `AIRTIME_PROPS`,
`TITLE_PROPS`, `READING_PROPS`, `GAME_PROPS`, `ALL_PROPERTY_NAMES`); codecs and managers use only
these, never literals. Code identifiers and model fields stay camelCase. The "older name" column is
what Hoard 0.1 / WatchLog Sync wrote; codecs no longer read those keys. The
[migrate-notes](../../guide/migrate-notes/README.md) guide renames them when migrating fork notes
([watchlog reference](../../guide/migrate-notes/watchlog.md)).

## Rules

- Title Case with spaces; acronyms upper case (`URL`, `ID`, `MAL`).
- A name from the Library plugin (`obsidian-library-plugin`) is adopted only when meaning and value
  form match. Adopted: Name, Cover, URL, Trailer, Runtime, Cast, Director, Author, Platforms,
  Achievements. Same name as Library, different value form: Genre (text here, links there),
  Progress, Playtime, Seasons. Kept own because the form differs: Date Added, Release Date,
  External ID, Rating (0-5 in half stars).
- The same name means the same value type across media.

## Names

| Name | Older name | Note |
|---|---|---|
| Name, Type, Status, Rating, Favorite, Groups | title, type, status, rating, favorite, groups | all media; `Type` values unchanged |
| Date Favorited / Started / Finished / Added / Modified | dateFavorited ... dateModified | ISO dates |
| Release Date | releaseDate | |
| URL | externalLink | the entry's page at its source |
| External ID | externalId | [grammar](external-id.md) |
| Cover | poster (titles), coverUrl (books, manga, games) | |
| Airtime Recurrence / Day / Time / Season / Episode / Acknowledged | airtimeRecurrence ... airtimeAcknowledged | titles, books, manga, games ([airtime](airtime.md)) |

Watchlist titles:

| Name | Older name | Note |
|---|---|---|
| Priority, Review, Total Episodes, Pinned, Maybe | same, camelCase | |
| Source Type | none (new) | `Anime`, `Movie` or `Series`, exact match; the title's kind and API route. `Type` is only a label/folder. Anything else is unreadable; absent = no API lookups, treated as a series |
| Progress | progress | now a number (percent), was text `"50%"` |
| Runtime | episodeDuration | minutes per episode |
| MAL ID, AniList ID | malId, anilistId | numbers |
| Community Rating / Votes / Source | communityRating ... | |
| Director, Cast, Studio | director, cast, studio | override lists |
| Added Director / Cast / Studio | manualDirector ... | credits added by the user |
| Trailer | trailer, manualTrailerUrl | |
| Watched Episodes, Skipped Episodes | watched, skipped | [episode range](episode-range.md) text |
| Seasons | seasons | lines `Name: N`; form differs from Library |

Books and manga: Author, Chapters Read, Total Chapters, Pages Read, Total Pages, Progress Unit,
Words Read, Total Words, Google Books ID, Volumes Read, Total Volumes (older: same in camelCase);
manga `MAL ID` (malId) is now a number in the note, was a string.

Games: Developer, Publisher, Genre, Priority, Wishlist, Progress (number 0-100), Playtime (text
`12h 30m`), Achievements (`30/42`), Platforms, Singleplayer, Co-op (coop), Multiplayer, Steam App ID,
Store URL, Last Played (older: camelCase equivalents).

Also folded on migration: `manualPosterUrl` → Cover, `manualTrailerUrl` → Trailer,
`apiSource` + `apiId` → External ID.

Widget block: `hoard-nowwatching` is now `hoard-now` (WatchLog `wl-nowwatching` maps to it via
[migrate-notes](../../guide/migrate-notes/README.md); [widgets](../modules/widgets.md)). Other blocks and their positional options are unchanged.

## Stability rule (from 1.0)

Property names and widget block names, options included, change only in a major version, always
with an idempotent automatic migration that detects old names **by content** (notes carry no version
marker). Folder layout, `Hoard.base` and `data.json` may change in minors, also with automatic
migration. Renaming known old keys, keeping values (except the `Progress` and manga `MAL ID` type
fixes), and leaving an old key in place when the new one already exists so a second run changes
nothing is the pattern. Hoard 0.1 vaults are not migrated at startup; use [guide/migrate-notes/](../../guide/migrate-notes/README.md).

## Custom fields

Reading custom columns (book and manga) are user data, not part of the frozen set. Only the key
pattern is stable: `Custom <column name>` (e.g. `Custom Format`), the name exactly as typed; the codec
maps it to the column by name (`customFieldKey` in [properties.ts](../../src/shared/storage/properties.ts)).
Names are unique per kind, ignoring case. Renaming a column moves the key in every note of that kind
(a note that already has the new key keeps both). Hoard never deletes custom values: deleting a column
and the full frontmatter rewrite leave them in the notes; only clearing a value on an entry removes that
entry's own key. `Custom *` keys without a column are ignored by the decoder and stay.

## Non-goals

Library's value vocabulary (`Type` values), date formats, and `Genre` / `Progress` / `Playtime` / `Seasons`
value forms that differ from Library.
