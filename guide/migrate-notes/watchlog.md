# WatchLog → Hoard

Two independent sources. Detect both; migrate fork first when both exist (so relative paths stay coherent), then original.

## Original (schema-1)

**Find:** `.obsidian/plugins/watchlog/data.json` with a `titles` array and no Hoard `schemaVersion`. Very old installs may also have `reading.json` / `history.json` beside it — merge those into the payload when present.

**Do not** treat that file as Hoard's own `data.json`. Hoard refuses a local store that still looks like WatchLog schema-1.

### Titles → notes

For each title in `titles` (and each entry in `maybe` with `Maybe: true`):

| WatchLog field | Hoard property | Notes |
|---|---|---|
| `title` | `Name` | required |
| `type` | `Type` | folder = type name under root |
| `status`, `priority`, `review`, `rating`, `favorite`, `groups` | same Title Case names | |
| `dateStarted` / `dateFinished` / `dateAdded` / `dateModified` / `dateFavorited` / `releaseDate` | `Date …` / `Release Date` | ISO |
| `externalLink` | `URL` | |
| `posterUrl` / `manualPosterUrl` | `Cover` | manual wins |
| `totalEpisodes` | `Total Episodes` | |
| `episodeDuration` | `Runtime` | minutes |
| `malId` / `anilistId` | `MAL ID` / `AniList ID` | numbers |
| `director` / `cast` / `studio` | same | lists |
| `manualDirector` / `manualCast` / `manualStudio` | `Added Director` / … | |
| `trailer` / `manualTrailerUrl` | `Trailer` | |
| `pinned` | `Pinned` | |
| `seasons` | `Seasons` | lines `Name: N` |
| `watchedEpisodes` (number[]) | `Watched Episodes` | **absolute**, 1-based numbers across all seasons. Convert to per-season episode-range text (`S01E01-E12, S02E01-E03`) by walking `seasons` in order: episode `n` lies in the first season whose cumulative `episodes` count reaches `n`, at position `n` minus the episodes of all earlier seasons. Without `seasons`, use one season of `totalEpisodes`. Numbers beyond all seasons: keep out, report them. Movies with status Completed need no watched text |
| `seasons[].skippedEpisodes` | `Skipped Episodes` | numbers **relative to their season** (`S<season index>E<n>`), same grammar; not absolute |
| `tmdbId` + `tmdbMediaType` | `External ID` | `tmdb:movie:…` / `tmdb:tv:…` |
| `notes` (string) | body under `## Notes` | |
| maybe entries | `Maybe: true` | same type folder |

`Progress` on titles is a **number** (percent), not WatchLog's episode list.

Episode mapping is authoritative in [`src/shared/storage/episodeRange.ts`](../../src/shared/storage/episodeRange.ts) (`fromAbsolute`, `formatEpisodeRange`) and [docs/concepts/episode-range.md](../../docs/concepts/episode-range.md). Example: seasons `S1: 10`, `S2: 8`, watched `[1..10, 11, 12]` → `S01E01-E10, S02E01-E02`. A wrong conversion silently corrupts progress — when in doubt, skip the field and report the title.

Duplicate `Name`+`Type` in one run: append ` 2`, ` 3`, … (case-insensitive on macOS/Windows).

### Books / manga / games

From `reading.books`, `reading.manga`, `games.games` (or merged JSON siblings):

- Books → `Books/<Name>.md` with `Author`, page/chapter/word counters, `Google Books ID`, `External ID` as `gbooks:…` or `openlibrary:…`.
- Manga → `Manga/`; `MAL ID` is a **number**; `External ID` `mal:manga:…`.
- Games → `Games/`; `Playtime` text like `12h 30m`; `Achievements` like `30/42`; `Steam App ID`; `External ID` `steam:` / `rawg:` / `igdb:`.
- Custom reading columns → `Custom <column name>`; blank/duplicate column names become `Field N` / `Field N 2`.

### History, base, cache

- Append parseable history lines to `<root>/History.md`; leave foreign lines alone.
- Merge vocabulary into `Hoard.base` `hoard:` (types, statuses, …) without wiping Hoard's own; secrets never go into the base.
- Device settings / entry cache: fill only where Hoard is empty. Never copy API keys into `data.json`.

### Airtime

Write `Airtime Recurrence` / `Day` / `Time` / `Season` / `Episode` / `Acknowledged` on the matching note when the source had a schedule.

## Fork (WatchLog Sync)

**Find:** first path-sorted `.base` named `WatchLog.base` or holding a top-level `watchlog:` block. Its folder is the fork root.

Notes are already vault-shaped but use **Hoard 0.1 camelCase** keys. Copy managed entry folders into the Hoard root (type folders, `Books/`, `Manga/`, `Games/`, custom lists, `History.md`), then rename properties:

| Older key | Current name |
|---|---|
| `title` | `Name` |
| `type` | `Type` |
| `status` | `Status` |
| `rating` | `Rating` |
| `favorite` | `Favorite` |
| `dateFavorited` / `dateStarted` / `dateFinished` / `dateAdded` / `dateModified` | `Date Favorited` / … |
| `releaseDate` | `Release Date` |
| `externalLink` | `URL` |
| `externalId` | `External ID` |
| `groups` | `Groups` |
| `poster` / `coverUrl` / `manualPosterUrl` | `Cover` |
| `airtimeRecurrence` … `airtimeAcknowledged` | `Airtime Recurrence` … |
| `priority` / `review` / `progress` / `totalEpisodes` | `Priority` / `Review` / `Progress` / `Total Episodes` |
| `episodeDuration` | `Runtime` |
| `malId` / `anilistId` | `MAL ID` / `AniList ID` |
| `communityRating` / `communityVotes` / `communitySource` | `Community Rating` / … |
| `director` / `cast` / `studio` | same Title Case |
| `manualDirector` / `manualCast` / `manualStudio` | `Added Director` / … |
| `trailer` / `manualTrailerUrl` | `Trailer` |
| `pinned` / `maybe` | `Pinned` / `Maybe` |
| `watched` / `skipped` | `Watched Episodes` / `Skipped Episodes` |
| `seasons` | `Seasons` |
| `author`, `chaptersRead`, … (reading camelCase) | Title Case reading props |
| `developer`, `publisher`, `genre`, `wishlist`, `playtime`, `achievements`, `platforms`, `singleplayer`, `coop`, `multiplayer`, `steamAppId`, `storeUrl`, `lastPlayed` | Title Case game props |

Value fixes: `progress` text `"50%"` → number `50`; manga `malId` string → number. Fold `apiSource` + `apiId` into `External ID` when neither `externalId` nor `External ID` exists.

Idempotent: if the new key already exists, keep the old key and report `kept-value`.

Rename the base key `watchlog:` → `hoard:` when adopting the fork base into Hoard's root (only when Hoard has no base yet, or merge vocabulary carefully).

## Widget fences

| WatchLog | Hoard |
|---|---|
| `watchlog` | `hoard` |
| `wl-todo` | `hoard-todo` |
| `wl-stat` | `hoard-stat` |
| `wl-upcoming` | `hoard-upcoming` |
| `wl-nowwatching` | `hoard-now` |
| `wl-now-next` | `hoard-now-next` |

Attributes after the language stay. Only rewrite fences the user opts into during cleanup.

## Cleanup

Ask first. Trash only source notes that Hoard holds as an identical copy (for original WatchLog notes: compare body below properties). A differing copy stays. Empty parent folders may go. Uninstalling the old plugin is the user's job under Community plugins.

## Types

Append watchlist type names from the source that Hoard lacks, by name only.
