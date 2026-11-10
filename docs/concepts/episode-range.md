---
type: Domain
title: Episode range
description: The S01E01-E12 notation in watched and skipped properties, and how it maps to absolute episode numbers.
source:
  - src/storage/episodeRange.ts
  - src/storage/titleCodec.ts
  - src/types.ts
source_commit: ad697fc09c2a2f8cff4b23d6c8bfdc29197a24d4
---

# Episode range

Progress is stored in the note as text, not as a number list: `Watched Episodes: S01E01-E12, S02E05`.
In memory a title holds `watchedEpisodes: number[]` as **absolute, 1-based episode numbers across
all seasons**; the two forms are converted by [episodeRange.ts](../../src/storage/episodeRange.ts).

- Token grammar: `S<n>E<m>`, same-season range `S01E01-E12`, cross-season range `S01E11-S02E02`
  (needs known seasons). Case-insensitive, comma-separated, `MAX_EPISODE = 10000` guards expansion.
- `parseEpisodeRange(text, seasons)` → `EpisodeRef[]` (sorted, deduped) or null on garbage.
- `formatEpisodeRange(refs)` writes the canonical form: consecutive runs per season collapsed.
- `toAbsolute` / `fromAbsolute` map between refs and absolute numbers using the season lengths;
  `outsideSeasons` returns refs the known seasons cannot place.

## Seasons the mapping uses

`mappingSeasons` in [titleCodec.ts](../../src/storage/titleCodec.ts): the title's seasons, else one
implicit "Season 1" of `totalEpisodes`. Seasons come from the note (`Seasons` lines `Name: N`,
optional `(skip spec)`, sets `seasonsOverride`) or from the [entry cache](entry-cache.md) (API).

- A **movie** (one season named "Movie", or no seasons and exactly one episode) carries no
  `Watched Episodes` text; `status: Completed` means episode 1 watched.
- While a season refill is **pending** (API identity, no seasons yet, fetch not ended in
  notfound/nokey) nothing is mapped and the note text is left untouched, so a fresh device cannot
  corrupt progress before the seasons arrive.
- Refs outside the known seasons survive as `unmappedWatched` / `unmappedSkipped` and are written
  back unchanged: a note from a device that knows more seasons loses nothing.
- Skipped episodes (filler) live per season in `skippedEpisodes`; `DataManager.getEffectiveTotal`
  subtracts them from progress.

Related: [modules/watchlist](../modules/watchlist.md).
