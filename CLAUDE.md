# Hoard

Obsidian plugin (id `hoard`). Package manager: pnpm.

## Commands
- `pnpm build` – typecheck + production build into `dist/`
- `pnpm dev` – watch build
- `pnpm lint` / `pnpm lint:fix`
- `pnpm test` – vitest + happy-dom; also writes Istanbul coverage to `coverage/`, which fallow reads for CRAP scores. Missing coverage, not refactoring, is the usual fix for a CRAP finding.
- `pnpm quality` – fallow full-repo analysis (dead code, dupes, complexity); must pass before a PR
- `pnpm quality:audit` – fallow audit of changed files vs `main`; also runs in CI and in the commit/push gate
- `pnpm check` – typecheck + lint + test + quality
- `pnpm smoke` – integration check against `hoard-test-vault/` in a running Obsidian (see CONTRIBUTING.md)
- Any fallow exception (`thresholdOverrides`, `fallow-ignore` comments, suppressions) needs the user's explicit approval first. Never add one on your own.

## Skills
Obsidian knowledge lives in `.claude/skills/` (`obsidian-dev`, `obsidian-ops`, `obsidian-ref`, `project`, `release`). These are maintained by hand; there is no generator.

## Codebase wiki

- `docs/` is the source-grounded wiki of this codebase, maintained via the `codebase-wiki` skill. Before touching an unfamiliar area, read `docs/index.md` and follow its links instead of re-exploring `src/`. Load pages on demand; the code stays the source of truth. `docs/values.md` is hand-written and never regenerated.
- **At the end of every plan execution** (before the final commit), refresh the wiki: invoke the `codebase-wiki` skill in refresh mode (it diffs each page's `source_commit` against the working tree), update only affected pages, and commit the wiki together with the change. The freshness anchor is derived from git, so every code change lands with its wiki refresh in the same PR.

## Core Policies
- **NEVER speak as the human on GitHub.** `gh` and `git` are authenticated as the repository owner, so anything an agent writes through them carries their name and avatar. Never post comments, replies or reviews on PRs or issues; an "automated by …" footer does not make it acceptable.
- **Resolving is not speaking: do it.** When you fixed and pushed a review finding, resolve its thread yourself (GraphQL `resolveReviewThread`), without a reply. Threads you rejected or did not touch stay open for the human.
- When in doubt about any other outward action through their account, ask first.
- **No hidden memory — this repo is the only source of truth.** Agent memory outside the repo is not documentation: it is unreviewed, invisible to the human, and drifts against the code. Never cite it as fact or act on it without re-deriving from the repo first. Findings worth keeping get written into the repo.
- **Never commit on `main`.** Every change, docs included, goes on a branch and lands through a PR. Before the first commit, check the branch; on `main`, create one first.
- Commit your work as you go — don't wait to be asked. Each plan phase usually gets its own commit; otherwise commit in logical groups (one concern per commit).
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(settings): add sync toggle`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`.
- Don't defer tasks when planning or implementing a plan.
- Keep your output concise and focused.

## Pull requests
Who opens the PR decides the body. Check once with `gh api user -q .login`.

**Repository owner (`Macavity`)** – the PR carries the owner's name and nobody else reviews it; local verification already happened. Body, nothing more:
- **What changed** – behaviour from the user's point of view, one paragraph.
- **Why** – one to three sentences.
- **Screenshot** of the visible change, taken in the test vault with `obsidian vault="hoard-test-vault" dev:screenshot path=<file>`. Push it as `pr-<branch>.png` to the orphan branch `screenshots` (never to `main`) and embed the `raw.githubusercontent.com` URL. Omit with a one-line note only for changes without UI.
- One line linking the wiki pages changed in this PR; they hold the decisions. No "how to verify" and no "notable decisions" section.
- Known, untouched problems may follow as a final line.

**Anyone else** (fork or external maintainer) – the owner reviews without your context. Body:
- **What changed** and **Why** as above.
- **How to verify** – commands run and the manual steps in the test vault.
- **Screenshot** of the visible change, attached to the PR; no `screenshots` branch.
- **Decisions** the reviewer should know, including rejected alternatives, unless the wiki pages in the PR already say so.

## Terminology

- Use **"properties"** when referring to YAML metadata at the top of Markdown files.
