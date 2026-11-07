# Codebase Wiki — Generate + Refresh

The user wants a **wiki of this codebase**, living in their own repo. Read the source code and author a navigable, diagram-rich, source-grounded wiki as plain markdown under `wiki/` at the repo root. It is version-controlled, co-editable, and becomes grounding context for future agent sessions.

**One toolset.** Read source and write wiki pages with the native tools (`Read`/`Grep`/`Glob`/`Edit`/`Write`/`Bash`). Pages are ordinary files: no server, no generator, and nothing that checks links for you — the link audit in Phase 7 is yours to run.

**Prerequisite.** The layout: `wiki/` with `architecture/ modules/ flows/ concepts/ guides/` and `wiki/OVERVIEW.md`. Check every path, not only the directory: `ls -d wiki/architecture wiki/modules wiki/flows wiki/concepts wiki/guides wiki/OVERVIEW.md` names what is missing. In Phase 0, before anything else, create the missing folders and, when `OVERVIEW.md` is missing, this stub. Unlike a page it has no `type`; its properties are exactly these:

```markdown
---
title: <Project> — Overview
description: "Home page and navigation hub for the <project> codebase wiki."
profile: internal/standard
tags:
  - wiki
  - overview
---
# Overview
```

---

## The two knobs

Read these from the user's natural-language request (e.g. "build the wiki, public and exhaustive"). They are not configuration anywhere else — they tune what you produce. Record the chosen profile in `wiki/OVERVIEW.md` properties (`profile: <audience>/<depth>`) so refreshes stay consistent.

| Knob | Values | Effect |
|---|---|---|
| `audience` | `internal` (default) or `public` | `internal`: dense; may cite internal infra; reference source via **relative links + symbol code-spans**. `public`: polished prose; **omit secrets, internal infra, ticket/PR numbers**; reference source via **GitHub blob URLs** (only if a remote exists — else fall back to relative). |
| `depth` | `tour`, `standard` (default), or `exhaustive` | `tour`: OVERVIEW + architecture + top flows only (fold modules into architecture). `standard`: + one page per package/module + concepts. `exhaustive`: + sub-module pages, `guides/`, per-flow failure modes, denser diagrams. |

Default when the user says nothing: `internal` / `standard`.

---

## Source-reference convention (how wiki pages point at code)

- **Intra-wiki navigation** → relative markdown links to the page file (`[Auth flow](../flows/auth.md)`). They are the navigation graph: every page must be reachable from `OVERVIEW.md`, and a page's backlinks are whatever `grep -rl "<file>.md" wiki` finds. Link liberally — density is how the wiki stays navigable.
- **Code references, `internal`** → a relative markdown link to the source file plus an inline code-span for the symbol — e.g. the `bootServer()` symbol in `[boot.ts](../../packages/server/src/boot.ts)`. Count the `../` hops from the page's own folder, not the wiki root: a page in `wiki/modules/` reaches the repo root through `../../`. Nothing flags a wrong-depth path, so check that the target exists (`ls`) before you move on. A cosmetic `#Lxx` is fine but drifts with the code.
- **Code references, `public`** → GitHub blob URLs (`https://github.com/<org>/<repo>/blob/<branch>/path/to/file.ts`) so a reader without the repo can follow them. Detect the remote with `git remote get-url origin`; if there is none, fall back to relative links.

Never invent paths — every source reference must point at a file you actually read.

---

## Mode detection — generate vs. refresh

Read the properties of `wiki/OVERVIEW.md`:

- **OVERVIEW is the stub** (no Navigation section, or its links point at pages that do not exist yet) → **GENERATE** (Phases 0-7 below).
- **OVERVIEW has a Navigation section whose pages exist** → **REFRESH** (jump to the *Refresh mode* section). Reuse the recorded `profile` unless the user explicitly changes a knob.

---

## GENERATE — phased, STOP-gated

Work the phases in order. Do not skip or batch ahead of a STOP gate. Each page is a new file written with `Write`, starting from the page skeleton and the folder's headings in `SKILL.md`, then filled section by section.

### Phase 0 — Resolve profile + scope (STOP gate 0)

1. Scaffold whatever the Prerequisite check reports missing.
2. Resolve `audience` + `depth` from the request (default `internal/standard`).
3. Propose the **coverage set** (which packages/dirs the wiki will document) and **exclusions** (vendored deps, build output, generated code, fixtures — `node_modules/`, `dist/`, `build/`, `vendor/`, `third_party/`, `coverage/`, lockfiles).
4. Present profile + coverage + exclusions to the user. **Wait for confirmation.**

### Phase 1 — Survey (no writes) (STOP gate 1)

Read, don't write:

1. **Detect the stack** — languages, build system, package manager, workspace/monorepo layout, entry points. (`Glob` for manifests: `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `*.csproj`; read them.)
2. **Bootstrap from existing docs** — READ `README`, `AGENTS.md`/`CLAUDE.md`, `ARCHITECTURE.md`, `CONTRIBUTING`, per-package READMEs. **Summarize and link to them; do NOT duplicate.** They are your highest-signal starting point.
3. **Map the modules** — list packages/top-level source dirs; note each one's rough purpose and entry points.
4. Produce an **inventory + a proposed page list scaled to `depth`**:
   - `tour` → OVERVIEW + 1-3 architecture pages + top 1-3 flows.
   - `standard` → + one module page per package + a concepts glossary.
   - `exhaustive` → + sub-module pages, `guides/`, per-flow failure modes.
5. Present the page list. **Wait for confirmation.**

### Phase 2 — Overview hub

Author `wiki/OVERVIEW.md` (edit the stub in place):

1. **What this is** — 1-2 paragraphs: what the project does, who it's for.
2. **Architecture at a glance** — a big-picture `mermaid` diagram. Example:
   ```mermaid
   flowchart TD
     CLI[command line] --> Core[core library]
     UI[editor plugin] --> Core
     Core --> Disk[(files on disk)]
   ```
   (Mermaid label text has sharp edges — keep node labels free of parentheses, quotes and pipes, or wrap the label in `["…"]`.)
3. **Navigation** — a map that links **every section and every page you will create**, as relative links. OVERVIEW is the hub; everything must be reachable from it. These targets do not exist yet; Phase 7 verifies them once every page is written.
4. **Set the properties**: `profile: <audience>/<depth>`. There is no commit stamp: the freshness anchor is the last commit that touched `wiki/`, so commit the generated wiki together with the code state it describes.

### Phase 3 — Architecture pages

One page per architectural area (boundaries, layers, subsystems, cross-cutting concerns). Each: a system-context or component `mermaid` diagram, the key components (with source references per the convention), and the design decisions behind them. Cross-link the modules and flows each area touches. (At `depth: tour`, modules fold into these pages.)

### Phase 4 — Module pages

One page per package/module (skip at `tour`; scale sub-module depth by knob). Use the module headings: purpose, responsibilities, public API / entry points, **key files** (linked per the convention), dependencies, and the flows it participates in. Cross-link concepts and flows.

### Phase 5 — Flows

Key end-to-end sequences (request lifecycle, build/deploy, a core interaction) as `mermaid` sequence or flow diagrams + narrative. At `exhaustive`, add a **Failure modes** section per flow. Link every module and concept the flow crosses.

### Phase 6 — Concepts / glossary

Atomic pages for domain terms and core abstractions (one term each): definition, why it matters, where it lives in the code. Keep them small and densely cross-linked so each concept becomes a hub for everywhere it appears. Link concepts from the architecture/module/flow pages that use them.

### Phase 7 — Link audit

1. Confirm **OVERVIEW links every page** (it is the nav hub). Add any missing nav links.
2. **Dead links** — every relative link, to a page or to a source file, must resolve from its page's folder. This prints each one that does not, and nothing when the wiki is clean:
   ```bash
   find wiki -name '*.md' | while read -r f; do d=$(dirname "$f"); grep -oE '\]\([^)#[:space:]]+' "$f" | sed 's/^](//' | grep -v '://' | while read -r l; do [ -e "$d/$l" ] || echo "$f -> $l"; done; done
   ```
3. **Orphans** — pages nothing links to. Adopt each by linking it from OVERVIEW or a relevant section page (or, rarely, justify it as intentionally standalone):
   ```bash
   find wiki -name '*.md' ! -name OVERVIEW.md | while read -r f; do b=$(basename "$f"); [ -n "$(grep -rlF -e "/$b" -e "]($b" wiki --include='*.md' | grep -v "^$f$")" ] || echo "orphan: $f"; done
   ```
4. **Hubs** — `grep -rlF "/<file>.md" wiki | wc -l` is a page's inbound count. A concept or module page that only OVERVIEW links to has not been cross-linked yet; that count is the signal cross-linking actually happened.
5. Tell the user the wiki is ready and point at `wiki/OVERVIEW.md`.

---

## REFRESH mode (after code changes)

Incremental by default — don't re-read the whole repo.

1. Read `profile` from `wiki/OVERVIEW.md` properties. Reuse the profile unless the user changed a knob. The anchor is `ANCHOR=$(git log -1 --format=%H -- wiki/)`, the last commit that touched the wiki (on a branch with the base merged in, that is the base's last refresh or your own).
2. `git diff --stat $ANCHOR -- . ':!wiki'` (working tree against the anchor, so uncommitted edits count) plus `git ls-files --others --exclude-standard` for files not yet staged. Inspect the changed paths. The anchor is only a valid baseline because wiki-touching commits never precede unrefreshed source commits; with `PREVIOUS=$(git log -2 --format=%H -- wiki/ | tail -1)` (the wiki commit before the anchor; skip this check when there is only one), `git log --oneline "$PREVIOUS..$ANCHOR" -- . ':!wiki'` lists source commits the anchor commit was supposed to cover; if the anchor commit itself changed no source (a wiki-only commit) and that list is not empty, widen the baseline to `$PREVIOUS`.
3. **Map changed code → affected pages.** For each changed package/area, update its module/architecture/flow pages (read the changed source first). Update OVERVIEW only if the structure changed (new package, removed subsystem, new top-level flow).
4. **Full-regen fallback.** If the diff is large or structural (many packages, a restructure), or git is unavailable, fall back to a full GENERATE pass rather than a partial patch.
5. Re-run the whole Phase 7 link audit, not only on the touched pages: OVERVIEW coverage and orphans are global conditions, and the loops are cheap.

---

## STOP rules / anti-patterns (load-bearing)

- **Pages are plain markdown written with the native tools** — no generator, no server; links are checked by the Phase 7 audit, not by anything automatic, so run it.
- **Summarize existing docs, don't duplicate them** — link to `README`/`ARCHITECTURE.md`; the wiki adds navigation and synthesis, not a copy.
- **Every source reference points at a file you actually read** — no invented paths or symbols.
- **Respect the profile** — at `audience: public`, never write secrets, internal infra, or ticket/PR numbers; reference code via GitHub URLs (or relative if no remote).
- **OVERVIEW is the hub** — every page must be reachable from it. Don't leave orphans (Phase 7 catches them).
- **Scaffold a missing layout first** (Phase 0) and keep every page inside the five folders.
- **Scale to `depth`** — don't write `guides/` or per-flow failure modes at `tour`; don't fold modules into architecture at `exhaustive`.
- **Refresh is incremental** — diff the last wiki commit against the working tree (it runs before the final commit) and touch only affected pages; full-regen only on large/structural diffs or when git is unavailable.

---

## Exit conditions

- **User aborts at a STOP gate** → exit cleanly, leaving any already-written pages in place.
- **Empty / unreadable repo** (no source detected in Phase 1) → tell the user there's nothing to document yet. Exit.
