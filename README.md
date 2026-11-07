# Hoard

A media library for movies, TV shows, anime, books, manga and games — stored as notes in your vault, on every device.

Hoard adds a sidebar panel with eight tabs:

- **Dashboard** — progress rings, time watched/remaining, library stats across all libraries.
- **Watchlist** — titles and groups with per-episode tracking, seasons, skipped episodes, community ratings (IMDb / MAL / AniList / TMDB), studios, cast and directors.
- **Upcoming** — release schedules with recurrence, countdowns and desktop notifications.
- **Reading** — books (pages or words) and manga (chapters, volumes), quotes pulled from your notes, custom columns.
- **Games** — status, completion %, playtime, platforms, wishlist, groups, optional Steam library sync.
- **Custom lists** — freeform Markdown-backed tables that can auto-pull remaining watch time.
- **Drafts** — scans your vault for a tag (default `#hoard`) and turns those lines into entries.
- **Log** — a unified activity timeline of everything you add, finish, rate or delete.

Desktop and mobile.

## Widgets

Inline code blocks render live progress anywhere in your notes:

| Block | Shows |
|---|---|
| `hoard` | overview |
| `hoard-todo` | track a title (full or mini) |
| `hoard-stat` | single stats (time watched, remaining, completed, ...) |
| `hoard-upcoming` | next upcoming release |
| `hoard-nowwatching` | titles in progress |
| `hoard-now-next` | now watching + up next card |

Use the command palette to insert a widget.

## Where your data lives

Everything you track is a Markdown note with properties (YAML frontmatter) under one root folder (default `Hoard/`). **The note is the record**: edit the properties by hand, on any device, and the plugin picks it up.

```
<root>/
  Hoard.base      shared settings (hoard: block)
  History.md      activity log
  <Type>/         one folder per Watchlist type (Anime/, Movie/, ...)
  Books/  Manga/  Games/  CustomLists/
```

| What | Where | Synced |
|---|---|---|
| Entries (titles, books, manga, games), progress, ratings, groups | notes in the root folder | yes |
| Activity log | `History.md` | yes |
| Shared settings: types, statuses, priorities, custom columns, API mapping | `Hoard.base` (`hoard:` key) | yes |
| API keys, Steam id, cached API data, colors, layout, saved filters | `data.json` of the plugin | no, per device |

### Sync caveats

Set up a second device by syncing the vault and installing the plugin. It finds the base file, reads the notes and is ready; only API keys have to be entered again. Let the first sync finish before you enable the plugin there: a device that starts on a half-synced vault treats itself as the first one and creates notes the sync is about to deliver.

`History.md` is one shared file that every device appends to. Obsidian Sync merges that; Syncthing or Git may leave a conflict copy when two devices log at the same moment. Nothing else is lost then, the log just needs a manual merge.

## API keys

Everything works manually without a key; APIs fill in posters, covers, episode counts, release dates and ratings. Configure them in **Settings → Hoard → API**; each card has a **Get a key** link, a help button and a **Test** button.

| Service | Used for | Key |
|---|---|---|
| [Tenrai](https://tenrai.org/) (MyAnimeList, Jikan-compatible) | Anime + manga, airing schedules, scores; endpoint switchable to any Jikan v4 instance (https only) | none |
| [AniList](https://anilist.co/) | Anime alternative to MyAnimeList | none |
| [OMDb](https://www.omdbapi.com/apikey.aspx) | Movies & TV, season episode counts, IMDb ratings | free key |
| [TMDB](https://www.themoviedb.org/settings/api) | Movies & TV, posters, cast, studios, collections | free read token |
| [Google Books](https://console.cloud.google.com/apis/credentials) | Book search, authors, page counts, covers | free key |
| [RAWG](https://rawg.io/apidocs) | Game search, covers, platforms | free key |
| [IGDB](https://dev.twitch.tv/console/apps) | Game alternative to RAWG | Twitch client ID + secret |
| [Steam](https://steamcommunity.com/dev/apikey) | Import owned games and playtime | Web API key + Steam ID |

Steam needs your profile's **Game details** privacy set to Public. For custom Watchlist types, pick the answering service under **API routing by type**.

## Migrating from WatchLog

On the first start in a vault used with WatchLog or WatchLog Sync, Hoard migrates once and shows a summary:

- **Base file:** `WatchLog.base` (or any `.base` with a `watchlog:` key) is renamed to `Hoard.base` (links follow) and its key to `hoard:`; filters and views stay as they are. If a `Hoard.base` already exists beside it, the old file is left alone and a warning goes to the developer console.
- **Plugin data:** while Hoard's own store is empty, it adopts the `data.json` of `watchlog-sync` (schema 2, as is) or `watchlog` (schema 1).
- **Schema 1:** the data is converted into notes, the base and `History.md`; a `data.v1-backup.json` is written beside the old `data.json` first. Existing note values are never overwritten.
- **Widgets:** code blocks `watchlog` and `wl-*` in your notes are rewritten to `hoard` and `hoard-*`.

Note folders and file names stay as they are. Disable the old plugin afterwards. A second start finds nothing to migrate.

## Credits

Hoard originates from the [WatchLog](https://github.com/Shynkro/watchlog-obsidian-plugin) plugin by BogdanS (Shynkro) and its vault-synced fork by Macavity.

## Development

```bash
pnpm install
pnpm dev     # watch build
pnpm build   # typecheck + production build
pnpm lint
pnpm test
```

`pnpm check` runs typecheck, lint, unit tests and the fallow quality analysis. Build output lands in `dist/`; `pnpm vault:link` installs it into a vault. See CONTRIBUTING.md for the test vault and smoke tests (`pnpm smoke`, `pnpm mobile:smoke`).

## Release

```bash
pnpm version patch|minor|major
git push --follow-tags
```

The GitHub workflow in `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json` and `styles.css` to the tagged release.

## License

[MIT](LICENSE)
