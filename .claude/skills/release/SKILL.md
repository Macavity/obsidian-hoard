---
name: release
description: Use when cutting a new release of this plugin — picking the next version, checking the code is release-ready, bumping and publishing through a merged release PR. Triggers on "release", "cut a release", "publish a new version", "bump the version", "tag 4.x.y", "what version should the next release be", "is this ready to release". Löst auch auf Deutsch aus - "Release machen", "neue Version veröffentlichen", "Version hochziehen", "welche Version", "können wir releasen".
---

# Release

Merging the release PR is the release. The GitHub workflow `.github/workflows/release.yml` runs on every push to `main` that changes `manifest.json`: when its `version` has no tag yet, it reruns the gate (typecheck, lint, test, build), creates the tag on that commit, attests and publishes. This skill covers everything before the merge and the check afterwards. Background on the mechanism: `.claude/skills/obsidian-ops/references/versioning-releases.md`.

Three facts drive every step. Never work around them.

1. **The release notes are the `## [<version>]` section of `CHANGELOG.md`.** The workflow extracts that section; when it is missing it warns and falls back to GitHub-generated notes. Commit messages play no role. A release without a section is the user's explicit choice (a quick hotfix), never a default.
2. **The tag equals `manifest.json`'s `version`, no `v` prefix.** The workflow creates it from the manifest; a hand-pushed tag that differs fails the run.
3. **Nothing is committed on `main`.** CHANGELOG, README and the version bump go on a `release/<version>` branch and reach `main` through a PR. Nobody tags by hand; the workflow tags the merge commit. So `pnpm version` always runs with `--no-git-tag-version`; without it, it commits and tags on its own.

## 1. Preconditions

Run all of these; a failed one stops the release until fixed.

```bash
git fetch origin
git switch main && git pull --ff-only
git status --short            # must be empty
gh pr list --state open       # releases wait for nothing that should be in them
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

- Release only from `main`, never from a feature branch. The community directory reads `manifest.json` from the head of the default branch.
- Dirty working tree or a checked-out feature branch: those changes are not part of the release. Ask the user whether to commit them on their branch, stash them, or leave them out, before switching to `main`.
- Compare against `origin/main`, not a stale local view.
- Zero commits since the last tag → nothing to release. Say so and stop.

## 2. Pick the version

Base the proposal on **user-visible change**, not commit subjects. Read the diff since the last tag:

```bash
LAST=$(git describe --tags --abbrev=0)
git diff --stat "$LAST"..HEAD -- src manifest.json README.md
git diff "$LAST"..HEAD -- manifest.json README.md
```

| Change since last tag | Bump |
| --- | --- |
| Breaks stored data (note properties, `WatchLog.base`, `History.md`, `data.json` schema) without migration, or removes a setting or command | **major** |
| New feature, new user-facing behaviour, migrated data shape, `minAppVersion` raised | **minor** |
| Only fixes, docs, tooling, refactors | **patch** |

Present the version with the two or three changes that justify it, and wait for the user's confirmation. Never bump before that.

## 3. Gate

All of it, every release, no matter how small the diff. CI ran on the PR, but the merge commit on `main` is a different tree.

```bash
git rev-parse HEAD            # note this as GATED: the tree the gate and notes cover
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm quality                  # informational here, not a gate
```

Then the automated section of `.claude/skills/obsidian-ops/references/release-readiness.md`: files at root, manifest consistent, no stray console output, README disclosures (network use: the services in the README's APIs table). Report each item as pass or fail with a concrete fix.

Local checks on this machine, run by you, not asked: `pnpm mobile:smoke` (mobile layout via desktop emulation) and, if Obsidian is running with `hoard-test-vault`, `pnpm smoke`. Report the result; a failure is a gate failure.

Never ask before the merge whether other platforms or a real phone or tablet were tested. Other devices install the plugin only from a published release (BRAT or the directory), so that test cannot happen before it. It is part of the check after the release (step 6).

A gate failure is fixed in its own `fix:` branch and PR before the release, or the release is called off.

## 4. CHANGELOG and README

**CHANGELOG.md** (Keep a Changelog style as used in this file: `## [<version>] - <YYYY-MM-DD>`, subsections `### Added`, `### Changed`, `### Fixed`, `### Removed`, `-` bullets, only subsections with content). If an `## [Unreleased]` section exists, compare it against the diff from step 2 and rename it; otherwise write the section. Every user-visible change since the last tag must be listed, nothing else (no refactors, tooling, fallow cleanups). Written for a plugin user, present tense, no commit hashes.

**README.md**. For each item in the new section, check that the README still describes the behaviour correctly ("Where your data lives", "Set up the APIs", "Worth knowing", screenshots). Fix what is stale. "The README was updated in the feature PR" is a claim to verify by reading.

Show the finished CHANGELOG section and any README diff to the user together with the version.

## 5. Release branch and bump

Only after the user confirmed version, CHANGELOG section and README changes. Work on a branch; never commit on `main`.

```bash
git switch -c release/<version>
git add CHANGELOG.md README.md
git diff --cached --quiet || git commit -m "docs: changelog for <version>"   # skipped for an approved hotfix without changelog or README change
pnpm version <patch|minor|major> --no-git-tag-version
git add package.json manifest.json versions.json
git commit -m "chore(release): <version>"
```

Check: `git show --stat HEAD` lists only `package.json`, `manifest.json`, `versions.json`, and `git tag --list <version>` is empty.

## 6. PR, merge = release

Each outward step needs the user's explicit go-ahead (`CLAUDE.md`): push the branch, open the PR, merge it. Ask for each, naming the version. The merge publishes; there is no later step to ask about.

```bash
git push -u origin release/<version>
```

```bash
gh pr create --base main --title "chore(release): <version>" --body "<the CHANGELOG section>"
```

Before merging, check that nothing reached `main` after the gate. Those commits would be inside the release but neither gated nor described:

```bash
git fetch origin
git log --oneline <GATED>..origin/main   # must be empty
```

Not empty: stop, tell the user, update the CHANGELOG and rerun the gate on the release branch (rebased on `origin/main`).

Merge only after the PR checks are green; `main` has no required checks, so GitHub merges a PR whose CI is still running. Merge as a **merge commit** (`gh pr merge --merge`, or "Create a merge commit" in the UI), like every other PR in this repo. Never a rebase merge: each release commit then lands on `main` separately.

Then verify, do not assume:

```bash
gh run list --workflow=release.yml -L 1   # the run for the merge commit
gh run watch <run-id>                     # until it completes
gh release view <version>                 # title = version, assets main.js, manifest.json, styles.css, body = CHANGELOG section
git fetch --tags && git rev-parse <version>^{commit}   # equals the PR's merge commit
```

- **Run skipped the release job** ("Tag <version> already exists"): the version was released before; the bump was wrong.
- **Run failed** on a transient error: `gh run rerun <run-id> --failed`; a rerun builds the same commit.
- **Gate failed in the run**: nothing was published. Fix it in a `fix:` PR that also adds the fix to the version's CHANGELOG section, merge, then start the workflow from the Actions tab (`workflow_dispatch`, ref `main`); it tags `main`'s head.
- **Workflow did not fire**: see "Release workflow did not fire" in `versioning-releases.md`. Never create the release by hand; that skips the build attestation.

Report the release URL and the asset list to the user. Then hand over the cross-device test: install the release on the other desktop platforms and a real phone or tablet (BRAT or the directory) and try it with a large vault. A regression found there gets a patch release through this skill, not a fix to the published tag.

## Rationalizations that end releases badly

- "Tiny change, skip the gate." The gate runs on every release. Skip only on the user's instruction, and say so.
- "I'll write the notes into the tag or commit message instead." The workflow reads only `CHANGELOG.md`.
- "It's a hotfix, skip the changelog." Only when the user says so; one `### Fixed` line takes a minute.
- "The README was touched in the PR, it's current." Read the sections named in step 4 against the change.
- "It's only the version bump, I'll commit it on `main`." Never; release branch and PR.
- "I'll tag it myself, it's faster." The workflow tags the merge commit; a hand tag can point at a commit the PR never covered.
- "The user said release, that covers the merge." Version, CHANGELOG and README are confirmed first; push, PR and merge each separately.
- "CI is still running, the merge button works." The merge publishes; wait for green checks.
- "CI was green on the PR." The merge commit is a different tree; run the gate on `main`.

Red-flag phrases: "should be fine", "I'll just", "basically the same as the PR", "no need to wait for the run".
