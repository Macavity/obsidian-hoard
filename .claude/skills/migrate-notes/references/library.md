# Library plugin → Hoard

Target: [obsidian-library-plugin](https://github.com/venvk/obsidian-library-plugin) (and close forks). Hoard already shares several property names with Library when meaning and value form match — see [`docs/concepts/properties.md`](../../../../docs/concepts/properties.md).

## Type and folder

| Library `Type` | Hoard `Type` / folder |
|---|---|
| `Movie` | `Movie` → `Movie/` |
| `Series` | `TV Show` → `TV Show/` |
| `Anime` | `Anime` → `Anime/` |
| `Book` / `Audiobook` | book → `Books/` (`Type` may be omitted or `book`) |
| `Manga` | manga → `Manga/` |
| `Game` | game → `Games/` |

Register any watchlist type Hoard lacks before writing notes.

## Property map

| Library | Hoard | Transform |
|---|---|---|
| `Name` | `Name` | as-is |
| `Cover` | `Cover` | URL as-is (use `Cover: none` in test fixtures that must stay offline) |
| `URL` | `URL` | as-is; also derive `External ID` when it is an IMDb/TMDB/MAL/AniList link |
| `Trailer` | `Trailer` | as-is |
| `Runtime` | `Runtime` | minutes (number) |
| `Cast` | `Cast` | plain names; strip wikilinks `[[…]]` |
| `Director` / `Creator` | `Director` or `Author` | by medium; strip links |
| `Author` | `Author` | books/manga |
| `Platforms` | `Platforms` | games |
| `Achievements` | `Achievements` | keep `done/total` text form |
| `My Rating` (0–10) | `Rating` (0–5) | divide by 2; round to whole stars unless the vault has half-star ratings on |
| `Rating IMDB` / other community scores | `Community Rating` (+ `Community Source` when known) | optional |
| `Progress: a/b` (episodes/chapters) | titles: `Watched Episodes` + `Total Episodes`; books: `Pages Read`/`Chapters Read` + totals | not title `Progress` (that is a percent number) |
| `Complete: true` | `Status: Completed` | |
| `Complete: false` with progress | `Status: Watching` or reading equivalent | |
| no progress | `Status: Plan to watch` / `Plan to Read` / `Not started` | match Hoard's vocabulary in `Hoard.base` |
| `Date` | `Date Added` | parse to ISO when possible |
| `Year` | `Release Date` | `YYYY` or `YYYY-01-01` if only a year |
| `Source` + `Source ID` | `External ID` | e.g. IMDb id → `imdb:tt…`; omit in offline test fixtures |
| `Genre` | `Genre` (games) or skip | Library often uses links; Hoard wants plain text |
| `Season` (count) | fold into `Seasons` / airtime only when you know episode totals | forms differ — do not invent season lines |
| `Log` | leave out or append to `History.md` if the user asks | Hoard history line format differs |
| Description callout / body | `## Notes` | keep user prose; drop auto-generated chrome if obvious |

## Value forms Hoard expects

- Dates: ISO (`YYYY-MM-DD` or full timestamp).
- `Watched Episodes`: `S01E01-E12` style ([episode-range](../../../../docs/concepts/episode-range.md)).
- `Seasons`: list of `Name: N` strings.
- `Playtime`: `12h 30m`.
- `External ID`: `source:id` or `source:kind:id` ([external-id](../../../../docs/concepts/external-id.md)).

## Conflicts

Same rules as the skill: fill missing keys only; report `kept-value` when the Hoard note already differs.
