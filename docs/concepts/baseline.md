---
type: Domain
title: Baseline
description: How a UI copy remembers the stored state it came from, so a write only touches what that copy changed.
source:
  - src/shared/storage/baseline.ts
  - src/modules/watchlist/services/DataManager.ts
source_commit: 1831cb60809d4ba37ab1c93d1039bcc90d2dd53c
---

# Baseline

Tabs and modals work on **mutable copies** of entries (`DataManager.viewOf`). Several copies may
exist, a note may change on disk meanwhile (sync, hand edit), and a stale copy must not undo that.
The baseline is the answer: each copy carries, in a symbol property, the stored state it was made
from ([baseline.ts](../../src/shared/storage/baseline.ts): `setBaseline`, `getBaseline`, and
`setNotesBaseline` for the `## Notes` body, which lives outside the properties).

The symbol property is enumerable so it survives object spread, but `Object.keys`, JSON and
`structuredClone` skip it: it never reaches a note, a backup or a deep compare.

## The two rules it enables

- A write diffs the encoded baseline against the encoded copy and touches only the properties
  that differ; the `## Notes` body is written only when the copy changed it. Sequence in
  [flows/entry-write](../flows/entry-write.md).
- After a write the copy becomes the UI's live view only if `basedOnStored` holds: its baseline
  still equals what the index holds now, with the id blanked (`sameStoredState`), so a rename
  does not invalidate it; an id the index does not know yet (a note being created) counts as
  fresh. A stale copy keeps nothing; the next read builds a fresh one.

Reading and game managers apply the same rules (`basedOnStored`, `afterWrite`). Custom lists use the same idea on the whole note: a save is refused when the note no longer holds the state the list was loaded from ([custom-lists](../modules/custom-lists.md#foreign-edits)).
