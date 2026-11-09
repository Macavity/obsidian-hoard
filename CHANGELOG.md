# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the plugin's `manifest.json`.

The release workflow takes the section of the released version from this file as the GitHub release notes. Without a section the release only carries the compare link.

## [Unreleased]

### Added

- Port of the WatchLog Sync plugin as Hoard: vault-backed storage (notes as records, `Hoard.base` for shared settings, `History.md` log, `data.json` for per-device state).
- Watchlist, Upcoming and Dashboard tabs with episode tracking, schedules, ratings and posters.
- Reading tab for books and manga; Games tab with RAWG/IGDB search and Steam sync.
- Custom lists, Drafts (vault tag scan) and Log (activity timeline) tabs.
- Code-block widgets `hoard`, `hoard-todo`, `hoard-stat`, `hoard-upcoming`, `hoard-nowwatching`, `hoard-now-next`.
- Settings tab with API, Customize and General pages, JSON backup and restore.
- Import wizard for WatchLog and WatchLog Sync data: offered at start when such data is found, copies it into Hoard's folder without touching the source, lists files to review (optionally as a note) and offers an opt-in cleanup (trash old notes Hoard holds identical copies of and a copied `WatchLog.base`, rename `watchlog` / `wl-*` widget code blocks). Also available in the settings.
- Test vault fixtures and a mobile smoke script.
- German translation. The plugin UI follows Obsidian's language setting (Settings → General → Language); other languages fall back to English. Stored values in notes and `Hoard.base` (status and type names) stay English.

### Changed

- Headings, buttons and labels use sentence case throughout (for example "Recently added", "Time watched", "Backup & restore").

### Known issues

- Large files and low UI test coverage are inherited from the fork; the full `fallow` analysis is red.
- `obsidianmd/settings-tab/prefer-setting-definitions` is disabled until the settings tab is migrated.

[Unreleased]: https://github.com/Macavity/obsidian-hoard/compare/0.0.1...HEAD
