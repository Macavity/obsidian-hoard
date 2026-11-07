---
name: codebase-wiki
description: "How to work in this project's codebase wiki: an agent-authored, source-grounded wiki of the surrounding codebase under `wiki/`, with `architecture/`, `modules/`, `flows/`, `concepts/` and `guides/` sections plus `wiki/OVERVIEW.md`. Read when asked to generate or refresh the wiki, or before editing a wiki page. Carries the per-folder rules and page skeletons, the freshness discipline, the audience/depth knobs and the source-reference convention, and bundles the full generate/refresh procedure in `references/`."
---
# Codebase wiki — how to work here

This project holds an **agent-authored wiki of its codebase** — DeepWiki, but living in the repo. A coding agent reads the source and writes a navigable, diagram-rich, source-grounded wiki as plain markdown under `wiki/`. It is version-controlled and diffable, human+agent co-editable, and doubles as durable grounding context for future agent sessions. There is no separate Q&A surface — Q&A is "an agent that has read these pages + `grep`".

## The shape

```
wiki/
  OVERVIEW.md     hub: what it is, a big-picture architecture diagram, a nav map to every section.
                  Properties carry `profile` (audience/depth).
  architecture/   system boundaries, layers, subsystems, cross-cutting concerns + diagrams
  modules/        one page per package / module: purpose, entry points, key files, deps
  flows/          key end-to-end flows as sequence / flow diagrams + narrative
  concepts/       glossary: atomic pages for domain terms / core abstractions
  guides/         task-oriented "how / where do I change X" (filled at depth >= standard)
```

## Generating + refreshing

Don't free-hand it — read **[references/generate-and-refresh.md](references/generate-and-refresh.md)** and follow the phased, STOP-gated procedure. It auto-detects mode: a stubbed `OVERVIEW.md` (no navigation to existing pages) → **generate** (survey → overview → architecture → modules → flows → concepts → link audit); a filled `OVERVIEW.md` → **refresh** (diff the last commit that touched `wiki/` against HEAD, update only affected pages).

**Plain files, native tools.** Read source and write wiki pages with the native tools (`Read`/`Grep`/`Glob`/`Edit`/`Write`/`Bash`). Nothing checks links for you: a link to a source file must resolve from the page's own folder when you write it, and links between pages are verified by the link audit in the reference, run after a generate (once every page exists; until then OVERVIEW's nav links point at pages still to come) and after every refresh.

## The two knobs

Two natural-language knobs, read from the user's request (e.g. "build the wiki, public and exhaustive") and recorded in the `OVERVIEW.md` properties (`profile: <audience>/<depth>`) so refreshes stay consistent:

- **`audience`** — `internal` (default) or `public`. `public` means polished prose, no secrets / internal infra / ticket numbers, and GitHub-URL source references.
- **`depth`** — `tour` | `standard` (default) | `exhaustive`. Scales coverage from OVERVIEW + architecture + top flows up through per-package module pages, concepts, and task guides.

[references/generate-and-refresh.md](references/generate-and-refresh.md) is the authoritative source for exactly how each knob shapes the output — read it before generating.

## Source-reference convention

- **Intra-wiki navigation** → relative markdown links to the page file (`[Auth flow](../flows/auth.md)`). They are the navigation graph, so link liberally; density is how the wiki stays navigable. `grep -rl "flows/auth.md" wiki` finds a page's backlinks.
- **Code references** → relative links + symbol code-spans (`internal`) or GitHub blob URLs (`public`). Count the `../` hops from the page's folder: a page in `wiki/modules/` reaches `src/` through `../../src/`. Nothing flags a wrong-depth path, so check that the target exists. Never invent paths — reference only files you actually read.

The full rules — the GitHub-URL / relative fallback, the `#Lxx` caveat, and the exact code-span shape — live in [references/generate-and-refresh.md](references/generate-and-refresh.md).

## Per-folder rules

**`architecture/`** — One page per architectural area (boundaries, layers, subsystems, cross-cutting concerns). Each: a `mermaid` system-context or component diagram, key components (with source refs), and the design decisions behind them. Headings: Summary, Diagram, Key components, Design decisions, Related. At `depth: tour`, modules fold in here.

**`modules/`** — One page per package / module: purpose, responsibilities, public API / entry points, key files (linked per the convention), dependencies, and flows it participates in. Headings: Summary, Responsibilities, Public API / entry points, Key files, Dependencies, Participates in, Related. Skipped at `tour`; sub-module depth scales with the knob.

**`flows/`** — Key end-to-end sequences as `mermaid` sequence / flow diagrams + narrative. Headings: Summary, Trigger, Sequence diagram, Steps, Failure modes (only at `exhaustive`), Related. Link every module and concept the flow crosses.

**`concepts/`** — Atomic glossary pages (one term each): definition, why it matters, where it lives in the code. Headings: Definition, Why it matters, Where it lives, Related. Keep small and densely cross-linked so each concept becomes a hub.

**`guides/`** — Task-oriented "how / where do I change X" walkthroughs. Headings: Goal, Steps, Relevant code, Gotchas, Related. Populated at `standard`, rich at `exhaustive`, thin/empty at `tour`.

## Freshness discipline (MUST)

The freshness anchor is derived from git, not stored in a page: the last commit that touched `wiki/` (`git log -1 --format=%H -- wiki/`) is the state the wiki was last refreshed against, and refresh mode diffs it against the working tree (the refresh runs before the final commit) to update only the affected pages. This holds because every code change lands with its wiki refresh in the same PR (CLAUDE.md); a wiki-only commit moves the anchor, so never commit wiki edits for code that has not been refreshed. A stamp in `OVERVIEW.md` was dropped: parallel branches collided on it in every merge.

## Page skeleton

Every page starts with these properties, then an H1 equal to `title` and the folder's headings as H2:

```markdown
---
title: <Page title>
description: "<one sentence on what the page covers>"
type: <architecture | module | flow | concept | guide>
tags:
  - wiki
  - <type>
---
# <Page title>
```

`OVERVIEW.md` carries `profile` instead of `type`, and the tag `overview`; its exact stub is in the reference's Prerequisite. Headings carry only structure; what each section is for is described above and in the reference, not repeated inside page bodies.
