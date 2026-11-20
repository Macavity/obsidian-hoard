---
type: Module
title: Add
description: What the add module owns (the one add wizard and the provider role), what each feature module supplies, and the import boundaries that keep it free of feature modules.
source:
  - src/modules/add/exports.ts
  - src/modules/add/domain/provider.ts
  - src/modules/add/domain/sectionOrder.ts
  - src/modules/add/ui/AddWizardModal.ts
  - src/app/wiring/add.ts
  - src/app/main.ts
  - src/design-system/SectionedResults.ts
  - src/shared/services/recentRows.ts
  - src/modules/watchlist/ui/watchlistAddProvider.ts
  - src/modules/reading/ui/readingAddProvider.ts
  - src/modules/games/ui/gamesAddProvider.ts
  - .fallowrc.json
source_commit: 5f7a103
---

# Add

One dialog adds every kind of entry: anime, series, movie, manga, book, game. The module owns the dialog
([AddWizardModal.ts](../../src/modules/add/ui/AddWizardModal.ts)) and the **provider role**; it knows no
feature. Sequence from query to note: [flows/add-title](../flows/add-title.md).

## The provider role

[domain/provider.ts](../../src/modules/add/domain/provider.ts), published by `exports.ts` as types only
(`AddKind`, `AddTarget`, `AddHit`, `AddDone`, `AddFormContext`, `AddFormHandle`, `AddProvider`,
`AddWizardOptions`, `OpenAddWizard`). A feature module offers one `AddProvider`:

- `kinds` it can add, `maybeKinds` it can save as a Maybe note (only the watchlist has any), `search(kind, query)`
  returning `AddHit`s already mapped to what a row shows (including `inLibrary`, the name of the library that
  holds it).
- `renderForm(host, ctx)`: step 2. `ctx.hit` is the picked hit, null for a manual entry; the form calls
  `ctx.done({ kind, id })` after the note is written. The wizard owns the Back button.
- optional `resolveUrl(text)`: null = "not my link"; a hit = open its form; `{ message }` = a link it owns that
  cannot be resolved (not found, no key, error), shown instead of searching the link text. It runs on every
  query, so it must answer null without network access for text that is no link of its own.

Providers are the [watchlist](watchlist.md) (anime, series, movie; links to IMDb, TMDB, MyAnimeList, AniList),
[reading](reading.md) (book, manga; MyAnimeList and AniList manga links) and [games](games.md). Each keeps its search
rows in a `RecentRows` ([recentRows.ts](../../src/shared/services/recentRows.ts), capped at 500, oldest dropped) so
a picked hit carries its source record into the form; a hit whose row is gone opens the form with the hit's title
and cover only and a notice.

## Boundaries

- `add` imports no feature module (`.fallowrc.json`: only `design-system`, `shared`, `obsidian-mock`).
- Providers, forms and the tabs that open the wizard reach `add` **type-only** (`allowTypeOnly: modules/add` for
  airtime, custom-lists, drafts, games, reading, watchlist); the wizard class is never imported by them.
- `app` wires: [wiring/add.ts](../../src/app/wiring/add.ts) is the only place that creates the dialog.
  `main.ts` holds a mutable provider list the wizard reads when it opens, so tabs built before the providers
  exist can already hold `openAddWizard`; it pushes the watchlist, reading and games providers after building them.
- When two providers claim a kind, the first in that list wins. Kinds shown = the providers' kinds (or `maybeKinds`
  for target `maybe`), ordered by `orderKinds`: the caller's `preferredKinds` first, then the canonical order.

## Entry points

`openAddWizard(opts)`: the `add-title` command (then `revealAdded` opens the watchlist detail unless
`openWatchlistAfterAdd` is off), the Watchlist, Reading and Games add buttons (`preferredKinds` = their kinds), the
Upcoming Maybe sub-tab (`target: 'maybe'`), and Drafts and Custom lists (`query` = the row's text).

## Where to change what

| Change | Place |
|---|---|
| Step 1 behaviour, sections, status lines | `AddWizardModal.ts`; list widget in `design-system/SectionedResults.ts` |
| A kind's search, hit mapping, link parsing | that module's `*AddProvider.ts` |
| A kind's form and its note | `TitleAddForm.ts`, `ReadingAddForm.ts`, `GameAddForm.ts` |
| A new kind | `ADD_KINDS` and `AddKind` in `provider.ts`, the `add.wizard.kind*` strings, a provider; a change to `exports.ts` goes through the exports-reviewer |
