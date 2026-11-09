---
type: Module
title: Drafts
description: How tagged lines in vault notes become add candidates, why the pending count is computed twice, and what is persisted.
source:
  - src/DraftsTab.ts
  - src/DraftChoiceModal.ts
  - src/AddRouter.ts
  - src/HoardView.ts
  - src/DataManager.ts
source_commit: 89be701597836592a0ea6243d561604a1a62bc5f
---

# Drafts

An inbox: the user writes `#hoard Some Title` anywhere in the vault; the Drafts tab
([DraftsTab.ts](../../src/DraftsTab.ts)) lists those titles and routes each into Watchlist, Books,
Manga or Games. Drafts are not entries and have no note; only triage state is persisted.

## Scan

`scanTaggedFiles` is static and pure: for every Markdown file whose `metadataCache` tags contain
the tag exactly (inline tags only, properties ignored), each line holding the tag yields the text
after the tag, split on commas; each trimmed non-empty segment up to 100 characters is one draft.
Key = lowercased title, sources = the file basenames. `scanVault` merges persisted state: records
`firstSeen` and display text for new keys, drops dismissed keys, marks added ones, sorts oldest
first. While the tab is open, `metadataCache.on('changed')` re-renders after 500 ms.

## Pending count, twice

A draft is pending when it is neither added nor dismissed and has no library match (Fuse over all
titles, books, manga and games, threshold 0.35; matches show "In <library>" and are dimmed). The
rule is implemented in two places that must agree: `renderUI` inside the tab, and the static
DOM-free `computePendingCount`, which the `TABS` badge calls without opening the tab. The badge
refreshes on `metadata-resolved`, not on `hoard-data-changed`, because it needs the vault scan
([ui kit](../architecture/ui-kit.md)).

## Actions and persistence

- Add: `openAddForTitle` ([AddRouter.ts](../../src/AddRouter.ts), shared with custom lists) opens
  `DraftChoiceModal` (watchlist, book, manga, game) and the matching add modal prefilled with the
  title. After adding, `draftsAfterAdding` decides: `remove` dismisses, `keep` (default) marks the
  card "Added".
- Dismiss is permanent per key; there is no un-dismiss in the tab.
- `DraftPersistState` (`dismissed`, `added`, `firstSeen`, `titleDisplay`, all keyed by lowercase
  title) lives in `data.json` via `DataManager.getDrafts` / `setDrafts`, device-local. The tag
  (`draftsVaultTag`, default `#hoard`) and `draftsAfterAdding` are device-local settings too.

## Where to change what

| Change | Place |
|---|---|
| Tag syntax, line parsing | `scanTaggedFiles` (badge and tab) |
| Match strictness | `buildFuse`, `findLibraryMatch` |
| Pending rule | both `renderUI` and `computePendingCount` |
| Badge timing | `badge.refreshOn` in `HoardView.ts` |
| Routing and prefill | `DraftChoiceModal.ts`, `AddRouter.ts` |
