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

Desktop and mobile. The interface follows Obsidian's language setting and is available in English and German; other languages fall back to English.

## Widgets

Inline code blocks render live progress anywhere in your notes:

| Block | Shows |
|---|---|
| `hoard` | overview |
| `hoard-todo` | track a title (full or mini) |
| `hoard-stat` | single stats (time watched, remaining, completed, ...) |
| `hoard-upcoming` | next upcoming release |
| `hoard-now` | titles in progress |
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
| API keys, Steam id, IGDB client id, Jikan endpoint | Obsidian's keychain (secret storage); never in backups | no, per device |
| Cached API data, colors, layout, saved filters | `data.json` of the plugin | no, per device |

### Sync caveats

Set up a second device by syncing the vault and installing the plugin. It finds the base file, reads the notes and is ready; only API keys have to be entered again. Let the first sync finish before you enable the plugin there: a device that starts on a half-synced vault treats itself as the first one and creates notes the sync is about to deliver.

`History.md` is one shared file that every device appends to. Obsidian Sync merges that; Syncthing or Git may leave a conflict copy when two devices log at the same moment. Nothing else is lost then, the log just needs a manual merge.

## API keys

Search, posters and covers work without any key through Cinemeta, Open Library and the Steam Store. Keyed APIs add more: ratings, episode counts, cast, studios, airing info. Configure them in **Settings → Hoard → API**; each card has a **Get a key** link, a help button and a **Test** button. A keyed source takes over once its key is set; until then the keyless one answers.

| Service | Used for | Key |
|---|---|---|
| [Cinemeta](https://v3-cinemeta.strem.io/) | Movies & TV search and posters (default) | none |
| [Open Library](https://openlibrary.org/) | Book search and covers (default) | none |
| [Steam Store](https://store.steampowered.com/) | Game search and covers (default) | none |
| [Tenrai](https://tenrai.org/) (MyAnimeList, Jikan-compatible) | Anime + manga, airing schedules, scores; endpoint switchable to any Jikan v4 instance (https only) | none |
| [AniList](https://anilist.co/) | Anime alternative to MyAnimeList | none |
| [OMDb](https://www.omdbapi.com/apikey.aspx) | Movies & TV, season episode counts, IMDb ratings | free key |
| [TMDB](https://www.themoviedb.org/settings/api) | Movies & TV, posters, cast, studios, collections | free read token |
| [Google Books](https://console.cloud.google.com/apis/credentials) | Book search, authors, page counts, covers | free key |
| [RAWG](https://rawg.io/apidocs) | Game search, covers, platforms | free key |
| [IGDB](https://dev.twitch.tv/console/apps) | Game alternative to RAWG | Twitch client ID + secret |
| [Steam](https://steamcommunity.com/dev/apikey) | Import owned games and playtime | Web API key + Steam ID |

Steam needs your profile's **Game details** privacy set to Public. For custom Watchlist types, pick the answering service under **API routing by type**.

## Importing from WatchLog

Hoard starts as a fresh install in its own `Hoard/` folder and never changes WatchLog data on its own. When it finds data of WatchLog (its plugin folder: `data.json`, on very old installs also `reading.json` and `history.json`, plus its notes) or WatchLog Sync (notes below the folder of `WatchLog.base`), a wizard offers to import it before Hoard loads:

- **Import** copies the data into Hoard's folder (`Hoard/`, or wherever your `Hoard.base` lives); the source stays untouched. Existing Hoard notes are only filled, never overwritten; the one exception is a property that still holds a value an API delivered earlier, which the imported value replaces. Watchlist types Hoard does not know yet are added. WatchLog Sync notes keep their relative paths; API keys and device settings are taken only where Hoard has none.
- **Result** lists what was created and filled, and every file to review (target already existed, a Hoard value differed and was kept, errors). The list can be saved as a note.
- **Clean up** is optional and nothing is preselected: old notes that Hoard holds as an identical copy (for WatchLog's own notes: the same text below the properties; their properties are WatchLog's view of `data.json` and are not compared) and a `WatchLog.base` that Hoard's base was copied from go to the trash (a source whose Hoard copy differs stays), widget code blocks `watchlog` / `wl-*` can be renamed to `hoard` / `hoard-*`. To remove the old plugin data, uninstall the plugin under Community plugins.

"Later" asks again on the next start, "Don't import" stops asking on this device for the sources found then (a source that appears later is offered again). Import and cleanup stay available in Hoard's settings under "Backup & restore". You can keep using WatchLog alongside Hoard; both keep their data apart.

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

Releases go through a `release/<version>` branch and a pull request: `CHANGELOG.md` gets a section for the version, `pnpm version <patch|minor|major> --no-git-tag-version` bumps it, and merging the PR publishes: `.github/workflows/release.yml` sees the new version in `manifest.json`, runs typecheck, lint, test and build, tags the merge commit with the bare version (no `v`), and attaches `main.js`, `manifest.json` and `styles.css` to the release and uses the changelog section as release notes.

## License

[MIT](LICENSE)
