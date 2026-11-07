---
type: Domain
title: History line
description: The one-line-per-event format of History.md and how foreign lines are preserved.
source:
  - src/storage/historyLine.ts
  - src/storage/HistoryStore.ts
  - src/HistoryManager.ts
source_commit: f332097642ac929ff59c2f9fda5174ffe46dc184
---

# History line

`<root>/History.md` is the activity log, one bullet per event:

```
- 2026-02-03T19:04:11.000Z · watched · [[TV Show/Dark]] · Dark (TV Show) episode 3 watched #watchlist
- 2026-02-03T19:05:00.000Z · group-created · Weekend
```

Grammar ([historyLine.ts](../../src/storage/historyLine.ts)): `- <ISO timestamp> · <action> ·
<target>[ · (<message>[ <source-tag>] | <source-tag>)]` with `<source-tag>` one of `#watchlist`,
`#reading`, `#games`; separator ` · `. The tag is the tail of the optional fourth part, so a tag
without a message still follows a ` · `. Actions: `added`,
`completed`, `deleted`, `status`, `rating`, `watched`, `group-created`. A target in `[[...]]` is the
[entry id](entry-id.md) (decision C1 in code comments), so Obsidian keeps the link on rename; a plain
target is a name. Whitespace in names is collapsed so one entry is always one line.

## Store behaviour

[HistoryStore.ts](../../src/storage/HistoryStore.ts):

- Lines that do not parse are **foreign and always preserved**: `appendMany` inserts before the
  trailing newline, `replaceAll` swaps only the parsed lines in place, `cap` drops the oldest parsed
  lines beyond 1000 and leaves the rest.
- Own writes are remembered by content; the `modify` watcher ignores them and reloads on any other
  change (`start(onExternal)`).
- Ids are `<timestamp>#<line index>`, assigned on load; `HistoryManager.log` assigns an optimistic id
  until the next load. The manager caps at 1000 entries and treats write errors as non-fatal.
- `HistoryManager.inferHistoryAction` / `inferHistorySource` parse older entries that predate the
  structured fields; `resolveRecentlyWatched` resolves entries back to titles by id, shortened link
  basename, or name.

Related: [modules/log](../modules/log.md).
