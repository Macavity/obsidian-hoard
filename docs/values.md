---
type: Values
title: Values
description: What Hoard will not trade away; the four commitments every invariant in this wiki traces back to.
---

# Values

What Hoard will not trade away. Four of them, named by the maintainer; this is the one page in
`docs/` that a refresh never rewrites. A rule in a module or concept page should be able to name
the value it serves; one that cannot is a decision or a constant, not a value.

Where a value can be checked by a machine, the gate is the authority: `pnpm check` (typecheck,
lint, tests, fallow quality analysis) and the dead-CSS check decide, prose only explains.

## The note is the record

An entry is a Markdown note with properties under one root folder. The user can read and edit it
by hand, in any editor, on any device, and the plugin picks the change up. A person who stops using
Hoard keeps everything they tracked.

This rules out: entry data in `data.json`; a second source of truth that must be kept in sync
with the notes; overwriting a value the user set by hand; losing foreign sections or lines in a
file the plugin shares with the user; a device that counts as primary.

Where it bites: `EntryIndex` never writes and treats a note from sync like its own
([architecture/storage](architecture/storage.md)); writes diff against a [baseline](concepts/baseline.md)
and touch only changed properties ([flows/entry-write](flows/entry-write.md)); `noteBody` replaces
only `## Notes`; `HistoryStore` preserves lines it cannot parse ([history line](concepts/history-line.md));
`baseFile` leaves everything but the `hoard:` block byte-identical; the [import](modules/import.md)
fills missing values and never overwrites; a second device adopts a synced base instead of creating
one ([flows/startup](flows/startup.md)).

## Secrets stay on the device

API keys, Steam id and logins live in the plugin's `data.json` and nowhere else: not in the base,
not in a note, not in a backup written into the vault.

This rules out: a shared-settings key that is not on the whitelist; a backup copy in the vault
that still holds a key; an endpoint URL with credentials leaving the device.

Where it bites: `SHARED_SETTING_KEYS` is a whitelist applied on every read and write
([shared vs local](concepts/shared-vs-local.md)); `withoutSecrets` and `withoutCredentials` strip
the vault copy of a backup ([flows/backup-restore](flows/backup-restore.md)); `restoreBackup`
refuses shared keys coming from the local section.

## Everything works without a key

APIs enrich; they never carry. Fetched data is a regenerable cache, not note content, and a value
the user wrote wins over anything fetched.

This rules out: a feature that breaks without a key; API data written into the note as if the user
had entered it; a fetch overwriting a user override; a failed fetch cached as a final answer.

Where it bites: the [entry cache](concepts/entry-cache.md) holds API data (E9) while the note holds
overrides and the poster (E12); `PosterService` never caches a failure as "none"
([architecture/api-layer](architecture/api-layer.md)); every add modal has a manual path and a
"no API configured" panel ([flows/add-title](flows/add-title.md)).

## The vocabulary belongs to the user

Types, statuses, priorities, reviews, reading columns, game platforms and the API used per type are
user-defined and unbounded. The shipped set is a starting point. Because they shape the notes, they
are the settings that sync.

This rules out: a fixed list where a user could want more; a type name the plugin refuses without
a reason it can state; a vocabulary that differs between two devices of the same vault.

Where it bites: the shared whitelist is exactly the vocabulary ([shared vs local](concepts/shared-vs-local.md));
a type is a folder, so `safeTypeName` / `typeNameError` explain any rejection
([entry id](concepts/entry-id.md)); `typeApiMapping` routes each type to its API
([modules/settings](modules/settings.md)).
