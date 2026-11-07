---
type: Module
title: Drafts
description: How the Drafts tab turns tagged lines in vault notes into pending add-candidates, computes the badge count and persists dismissed/added state; where to change each part.
source:
  - src/DraftsTab.ts
  - src/DraftChoiceModal.ts
  - src/AddRouter.ts
  - src/HoardView.ts
  - src/DataManager.ts
  - src/types.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Drafts

## Purpose / Boundary

A scratch inbox: the user writes `#hoard Some Title` anywhere in the vault; the Drafts tab lists those titles and routes each into Watchlist, Books, Manga or Games. Drafts are not entries and have no note of their own. The only persisted data is triage state.

## Entry points

- `DraftsTab` ([DraftsTab.ts](../../src/DraftsTab.ts)): `render()` = load state, `scanVault`, `renderUI`, register change listener. Registered in the `TABS` array of [HoardView.ts](../../src/HoardView.ts) with a `badge` of `DraftsTab.computePendingCount` and `refreshOn: 'metadata-resolved'`.
- `openAddForTitle` ([AddRouter.ts](../../src/AddRouter.ts)): shared with Custom Lists rows. Opens `DraftChoiceModal` ([DraftChoiceModal.ts](../../src/DraftChoiceModal.ts); four buttons: watchlist / book / manga / game), then the matching Add modal (`AddTitleModal` with type "Anime" default, `AddGameModal`, `AddReadingModal`) prefilled with the title.
- Settings: `settings.draftsVaultTag` (default `#hoard`), `settings.draftsAfterAdding` (`keep` | `remove`, default `keep`), edited in SettingsTab. Both are device-local: they are not in `SHARED_SETTING_KEYS` ([shared vs local](../concepts/shared-vs-local.md)).

## How it works

### Scan: lines to entries
`scanTaggedFiles` (static, pure): for each markdown file whose `metadataCache` tags include the tag exactly (inline tags only, frontmatter ignored), `cachedRead` the content, and for each line containing the tag take the text after the first occurrence of the tag; split on `,`; each trimmed, non-empty segment of at most 100 chars is one draft. Key = lowercased title; sources = set of file basenames. A line with the tag but nothing after it is skipped.
`scanVault` adds persisted state: records `firstSeen` (ISO) and `titleDisplay` for new keys (saves if changed), drops `dismissed` keys, marks `added`, sorts oldest-first.

### Duplicate detection and pending count
`buildFuse` indexes all titles of Watchlist, Books, Manga and Games (Fuse threshold 0.35). `findLibraryMatch` returns the library of the best match with score <= 0.35. Cards with a match show "In <library>", are dimmed and show the label "Added" instead of an Add button; sorted after non-matching cards.
Pending = not `added`, not `dismissed`, and no library match. Two computations that must agree:
- `renderUI` (in-tab; calls `onCountChange`).
- `computePendingCount` (static, DOM-free, used by the tab badge without opening the tab; reads `getDrafts()` itself, scans only tagged files).
The badge refreshes on `metadata-resolved` (HoardView badge config), so it follows vault metadata, not `hoard-data-changed`. While the tab is open, `metadataCache.on('changed')` triggers a debounced (500 ms) full `render()`.

### Actions and persistence
- Dismiss (x): push key to `dismissed`, remove from `added`, save, `rerenderFromCache` (no rescan).
- Add: `openAddForTitle` with `onAdded` -> `afterAdded`: `draftsAfterAdding === 'remove'` dismisses, else records the key in `added` (card stays, marked Added).
- Persistence: `DraftPersistState` (types.ts) `{ dismissed[], added[], firstSeen{}, titleDisplay{} }`, all keyed by lowercase title. `DataManager.getDrafts()` / `setDrafts()` read/write `local.data.drafts` and `local.queueSave()`: device-local (LocalStore data.json), not synced via the vault. See [shared vs local](../concepts/shared-vs-local.md), [storage](../architecture/storage.md).
- Dismissal is permanent per key: re-tagging the same title never reappears (no un-dismiss UI seen in DraftsTab.ts).

## Where to change what

| Change | Place |
|---|---|
| Tag syntax, line parsing, title splitting | `scanTaggedFiles` (affects badge and tab) |
| Duplicate matching strictness | `buildFuse` options, `findLibraryMatch` |
| Pending rule | both `renderUI` and `computePendingCount` |
| Badge timing | `badge.refreshOn` in HoardView.ts |
| After-add behaviour | `afterAdded`, `draftsAfterAdding` |
| Routing choices / prefill | DraftChoiceModal.ts, AddRouter.ts |
| Persisted fields | `DraftPersistState`, `getDrafts`/`setDrafts` |

## Links
[storage](../architecture/storage.md), [ui-kit](../architecture/ui-kit.md), [custom lists](custom-lists.md) (reuses `openAddForTitle`), [watchlist](watchlist.md), [settings](settings.md).
