---
tags: [sample]
---
# Welcome

Fixture catalogue of `hoard-test-vault/`. Hand-written on purpose; counts are asserted by `test/fixtures.test.ts` and `test/e2e/expected.mjs`. No note has an `externalId`.

Root is `Hoard/` (holds `Hoard.base`).

## Watch

- `Hoard/Movie/Arrival.md`: Movie, Plan to watch, only `episodeDuration`
- `Hoard/Movie/Blade Runner 2049.md`: Movie, Completed, review and rating
- `Hoard/Movie/Broken Properties.md`: invalid YAML, skipped by the index
- `Hoard/TV Show/Severance.md`: TV Show, Watching, two seasons, episodes watched; edit target of click flows
- `Hoard/TV Show/Chernobyl.md`: TV Show, Completed, all episodes watched
- `Hoard/TV Show/Minimal Entry.md`: only `title`, everything else defaulted
- `Hoard/Korean TV Show/Squid Game.md`: Korean TV Show, Dropped, partly watched
- `Hoard/Korean TV Show/Reply 1988.md`: `maybe: true`, not in the library
- `Hoard/Anime/Frieren Season 3.md`: Anime, To be released, manual `once` airtime dated 2099; `poster: none` stops the keyless Jikan poster search, so no smoke run touches the network
- `Hoard/Animation/Spider-Verse.md`: Animation, user overrides (credits, community rating), local poster `Assets/poster.png`, `## Notes` plus foreign `## Mine` section; detail-modal edit target

## Reading

- `Hoard/Books/Dune.md`: Book, Reading, 120 of 600 pages
- `Hoard/Manga/Berserk.md`: Manga, Plan to Read, 41 volumes

## Games

- `Hoard/Games/Hades.md`: Playing, platforms, playtime, achievements, group "Indie Picks"
- `Hoard/Games/Celeste.md`: Not started, one platform

## Custom lists

- `Hoard/CustomLists/Backlog.md`: three column types, two rows
- `Hoard/CustomLists/Watch Party.md`: minimal second list

## History

- `Hoard/History.md`: lines for `#watchlist`, `#reading`, `#games`, a group event, and two foreign lines that must be preserved

## Drafts

- `Inbox.md`: `#hoard` inline tags outside `Hoard/`; one draft matches a library title

## Assets

- `Assets/poster.png`: tiny local image, outside the entry folders
