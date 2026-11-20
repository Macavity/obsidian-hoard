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

## Secrets stay on the device

API keys, Steam id and logins live in Obsidian's secret storage on this device, never in
`data.json`, the base, a note or a backup.

This rules out: a shared-settings key that is not on the whitelist; a key written to `data.json`
by any path (settings, restore, import); a backup that still holds a key; an endpoint URL with
credentials leaving the device.

## Everything works without a key

APIs enrich; they never carry. Fetched data is a regenerable cache, not note content, and a value
the user wrote wins over anything fetched.

This rules out: a feature that breaks without a key; API data written into the note as if the user
had entered it; a fetch overwriting a user override; a failed fetch cached as a final answer.

## The vocabulary belongs to the user

Types, statuses, priorities, reviews, reading columns and game platforms are user-defined and
unbounded. The shipped set is a starting point. Because they shape the notes, they are the settings
that sync. What the plugin needs to know about an entry lives in the entry's own properties, not in
the meaning of a label.

This rules out: a fixed list where a user could want more; a name the plugin refuses without a
reason it can state; a label whose name changes behaviour; a vocabulary that differs between two
devices of the same vault.
