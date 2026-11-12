# Changelog

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow the plugin's `manifest.json`.

The release workflow takes the section of the released version from this file as the GitHub release notes. Without a section the release only carries the compare link.

## [Unreleased]

### Changed

- All CSS classes and custom properties of the plugin have new names (`hoard-<block>__<element>--<modifier>`, abbreviations spelled out). CSS snippets and themes that target Hoard's classes need the new names; `docs/architecture/css-blocks.md` lists the blocks.
- Colours, sizes and positions the plugin computes are set through CSS custom properties (`--hoard-…`) instead of inline styles, so snippets and themes can override them.
- Standalone labels are written in sentence case in English and German ("Show less", "Never played"); help texts name tabs, statuses and buttons the way the interface shows them.

### Fixed

- The WatchLog import wizard reacts again when Hoard is enabled from Obsidian's settings window (a window of its own since Obsidian 1.15); its buttons did nothing there. Closing that window while an import or cleanup runs no longer leaves Hoard waiting: the outcome appears as a notice.
- Changes made in Hoard's settings reach the main window again on Obsidian 1.15: widgets and the status bar refresh, and a new card size applies right away.

## [0.2.0] - 2026-11-11

### Added

- Search, posters and covers work without any API key: Cinemeta for movies and TV shows, Open Library for books, the Steam Store for games. OMDb/TMDB, Google Books and RAWG/IGDB take over once their key is set; each API card says which keyless source is used until then.
- Book notes keep both a Google Books and an Open Library id; the book CSV export includes the Open Library id.

### Changed

- Note properties use fixed, readable names (`Name`, `Status`, `Date Added`, `Cover`, `External ID`, ...). Custom reading columns are stored as `Custom <name>`; renaming a column moves the property in every note and reports notes it skipped. Notes of Hoard 0.1 keep their old property names and are not converted; the WatchLog import translates them.
- The widget `hoard-nowwatching` is now `hoard-now`. Existing `hoard-nowwatching` blocks no longer render; rename them.
- Custom lists never overwrite a list note that was changed elsewhere (another device, a hand edit): the save is refused, the list reloads and keeps the other change.
- API keys, the Steam id, the IGDB client id and the Jikan endpoint now live in Obsidian's keychain (secret storage) on each device instead of the plugin's `data.json`. Existing keys move there on first start. On every further device, enter them again in Hoard's settings; Hoard says so once.
- Backups no longer contain API keys, the Steam id, the IGDB client id or the Jikan endpoint. Restoring an older backup that still holds them fills only values that are not set on this device.
- Hoard now requires Obsidian 1.11.5 or later, the first version that encrypts its keychain at rest.

### Fixed

- Steam games on Windows show the platform as PC.
- Picking a game search result applies its name, id and fields together; missing details fall back to the search row.
- Watchlist search falls back to the search row when the details lookup comes back empty.
- Without a key, the detail view and the bulk studio refresh no longer mark credits and studios as permanently missing.
- A Steam capsule cover is checked before it is stored.

## [0.1.0] - 2026-11-10

### Added

- Port of the WatchLog Sync plugin as Hoard: vault-backed storage (notes as records, `Hoard.base` for shared settings, `History.md` log, `data.json` for per-device state).
- Watchlist, Upcoming and Dashboard tabs with episode tracking, schedules, ratings and posters.
- Reading tab for books and manga; Games tab with RAWG/IGDB search and Steam sync.
- Custom lists, Drafts (vault tag scan) and Log (activity timeline) tabs.
- Code-block widgets `hoard`, `hoard-todo`, `hoard-stat`, `hoard-upcoming`, `hoard-nowwatching`, `hoard-now-next`.
- Settings tab with API, Customize and General pages, JSON backup and restore.
- Import wizard for WatchLog and WatchLog Sync data: offered at start when such data is found, copies it into Hoard's folder without touching the source, lists files to review (optionally as a note) and offers an opt-in cleanup (trash old notes Hoard holds identical copies of and a copied `WatchLog.base`, rename `watchlog` / `wl-*` widget code blocks). Also available in the settings.
- German translation. The plugin UI follows Obsidian's language setting (Settings → General → Language); other languages fall back to English. Stored values in notes and `Hoard.base` (status and type names) stay English.

### Changed

- Headings, buttons and labels use sentence case throughout (for example "Recently added", "Time watched", "Backup & restore").
- Icon-only buttons share one base: Lucide icons instead of text glyphs (×, +, ⋮, ↻, ▲/▼), a fixed square size, tooltips, accessible labels and a visible keyboard focus ring. They no longer lose their icon on tablets.
- Tab bars are flat and no longer show a horizontal scrollbar.
- The trailer control in the detail view is a single button: play when a trailer is known, fetch otherwise. It no longer sits as a second refresh icon next to the rating refresh.

[0.2.0]: https://github.com/Macavity/obsidian-hoard/releases/tag/0.2.0
[0.1.0]: https://github.com/Macavity/obsidian-hoard/releases/tag/0.1.0
