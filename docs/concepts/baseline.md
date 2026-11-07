---
type: Domain
title: Baseline
description: How a UI copy remembers the stored state it came from, so a write only touches what that copy changed.
source:
  - src/storage/baseline.ts
  - src/DataManager.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# Baseline

Tabs and modals work on **mutable copies** of entries (`DataManager.viewOf`). Several copies may
exist, a note may change on disk meanwhile (sync, hand edit), and a stale copy must not undo that.
The baseline is the answer: each copy carries, in a symbol property, the stored state it was made
from ([baseline.ts](../../src/storage/baseline.ts): `setBaseline`, `getBaseline`, and
`setNotesBaseline` for the `## Notes` body, which lives outside the properties).

The symbol property is enumerable so it survives object spread, but `Object.keys`, JSON and
`structuredClone` skip it: it never reaches a note, a backup or a deep compare.

## How a write uses it

In `DataManager.writeTitle` ([DataManager.ts](../../src/DataManager.ts)):

1. `baselineOf(t)` = the copy's baseline, else the current slot's source, else the index entry.
2. Encode both baseline and copy; only properties whose encoded value differs are set or deleted
   through `processFrontMatter`. Unreadable or foreign properties stay untouched unless the edit
   changes exactly that field.
3. The `## Notes` body is written only when it differs from the body the copy started from.
4. `afterWrite` decides whether the copy becomes the UI's live view: only if `basedOnStored` holds
   (its baseline equals what the index holds now, ignoring the id). A stale copy keeps nothing; the
   next read builds a fresh one.

`sameStoredState` compares JSON with the id blanked, so a rename does not invalidate a copy.
Reading and game managers follow the same pattern (`basedOnStored`, `afterWrite`).

Related: [flows/entry-write](../flows/entry-write.md).
