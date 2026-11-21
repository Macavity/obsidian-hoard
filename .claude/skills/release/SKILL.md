---
name: release
description: Use when cutting a new release of this plugin, stable or beta — picking the next version and channel, checking the code is release-ready, bumping and publishing through a merged release PR, promoting a tested beta to stable. Triggers on "release", "cut a release", "beta", "cut a beta", "promote the beta", "make it stable", "publish a new version", "bump the version", "tag 4.x.y", "what version should the next release be", "is this ready to release". Löst auch auf Deutsch aus - "Release machen", "Beta schneiden", "Beta befördern", "stable machen", "neue Version veröffentlichen", "Version hochziehen", "welche Version", "können wir releasen".
---

# Release

Merging the release PR is the release. There are two channels, both published from `main`:

- **Stable**: the `version` in `manifest.json`. The community directory reads only this file at the head of `main`, so only a stable release reaches the directory.
- **Beta**: a prerelease `version` in `package.json` (`0.5.0-beta.0`). It is published as a GitHub pre-release, installed through BRAT, and the directory never sees it.

The workflow `.github/workflows/release.yml` runs on every push to `main` that changes `manifest.json` or `package.json`. `scripts/release-decide.mjs` decides: stable when `manifest.json`'s version has no tag, beta when `package.json` holds an untagged prerelease, otherwise nothing (a dependency bump). It reruns the gate (typecheck, lint, test, build), creates the tag on that commit, attests and publishes. This skill covers everything before the merge and the check afterwards. Background: `.claude/skills/obsidian-ops/references/versioning-releases.md`.

Not every release needs a beta. Beta first or stable directly are equal choices; the user picks per release (step 2).

Four facts drive every step. Never work around them.

1. **The release notes come from `CHANGELOG.md`.** A stable release takes its `## [<version>]` section, a beta takes `## [Unreleased]`. Betas get no section of their own. When the section is missing the workflow warns and the release carries the compare link alone. Commit messages play no role.
2. **The tag equals the released version, no `v` prefix.** The workflow creates it; a hand-pushed tag that matches neither `manifest.json` nor a prerelease in `package.json` fails the run.
3. **`package.json` equals `manifest.json`, or is a beta above it.** `versions.json` lists every stable version and no beta. `test/releaseVersions.test.ts` enforces this on every PR; `version-bump.mjs` keeps it when the bump goes through `pnpm version`.
4. **Nothing is committed on `main`.** CHANGELOG, README and the version bump go on a `release/<version>` branch and reach `main` through a PR. Nobody tags by hand. So `pnpm version` always runs with `--no-git-tag-version`; without it, it commits and tags on its own.

## 1. Preconditions

Run all of these; a failed one stops the release until fixed.

```bash
git fetch origin --tags
git switch main && git pull --ff-only
git status --short            # must be empty
gh pr list --state open       # releases wait for nothing that should be in them
STABLE=$(git tag --sort=-v:refname | grep -v -- - | head -n 1)   # last stable tag
LAST=$(git tag --sort=-v:refname | head -n 1)                    # last tag, stable or beta
git log --oneline "$LAST"..HEAD
```

- Release only from `main`, never from a feature branch.
- Dirty working tree or a checked-out feature branch: those changes are not part of the release. Ask the user whether to commit them on their branch, stash them, or leave them out, before switching to `main`.
- Compare against `origin/main`, not a stale local view.
- Zero commits since `$LAST` → nothing to release. Say so and stop. Exception: promoting a beta to stable with no commits since that beta (step 5).

## 2. Pick the version and the channel

Base the proposal on **user-visible change** since the last stable release, not commit subjects:

```bash
git diff --stat "$STABLE"..HEAD -- src manifest.json README.md
git diff "$STABLE"..HEAD -- manifest.json README.md
```

| Change since last stable | Bump |
| --- | --- |
| Breaks stored data (note properties, `WatchLog.base`, `History.md`, `data.json` schema) without migration, or removes a setting or command | **major** |
| New feature, new user-facing behaviour, migrated data shape, `minAppVersion` raised | **minor** |
| Only fixes, docs, tooling, refactors | **patch** |

Then the channel:

- **Beta**: the change is worth trying on the user's other devices before the directory offers it (new features, layout changes, anything touching mobile or storage).
- **Stable directly**: small fixes, docs, tooling; or the user says so.
- **Stable from a beta**: a beta is open (`package.json` holds a prerelease) and the user has tested it and approves it by name.

Present version **and** channel with the two or three changes that justify them, and wait for the user's confirmation. Never bump before that, and never pick the channel silently.

When a beta is open, a direct stable release ships the beta's code too (both live on `main`). Say so when proposing it; it is not a blocker.

## 3. Gate

All of it, every release, beta or stable, no matter how small the diff. CI ran on the PR, but the merge commit on `main` is a different tree.

```bash
git rev-parse HEAD            # note this as GATED: the tree the gate and notes cover
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
pnpm quality                  # full fallow analysis; findings are a gate failure
pnpm mobile:smoke             # mobile layout via desktop emulation
pnpm smoke                    # integration run in Obsidian against hoard-test-vault
```

`pnpm smoke` needs Obsidian running with the `hoard-test-vault` window visible. Start it yourself, do not ask: run `pnpm vault:open`, then wait until `obsidian vault="hoard-test-vault" eval code="1"` answers (give up after about 60 s). Only if that fails (vault not registered, Restricted mode on, plugin disabled) tell the user exactly what failed and ask them to fix it. See CONTRIBUTING.md, "Smoke".

Then the automated section of `.claude/skills/obsidian-ops/references/release-readiness.md`: files at root, manifest consistent, no stray console output, README disclosures (network use: the services in the README's APIs table). Report each item as pass or fail with a concrete fix.

A gate failure is fixed in its own `fix:` branch and PR before the release, or the release is called off.

## 4. CHANGELOG and README

**CHANGELOG.md** (Keep a Changelog style as used in this file: subsections `### Added`, `### Changed`, `### Fixed`, `### Removed`, `-` bullets, only subsections with content). Every user-visible change since the last stable release must be listed under `## [Unreleased]`, nothing else (no refactors, tooling, fallow cleanups). Written for a plugin user, present tense, no commit hashes. Compare it against the diff from step 2 and complete it.

- **Beta**: `## [Unreleased]` stays as it is; the workflow takes it as the beta's notes.
- **Stable**: rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>`.

**README.md**. For each item in the section, check that the README still describes the behaviour correctly ("Where your data lives", "Set up the APIs", "Worth knowing", screenshots). Fix what is stale. "The README was updated in the feature PR" is a claim to verify by reading.

Show the finished CHANGELOG section and any README diff to the user together with version and channel.

## 5. Release branch and bump

Only after the user confirmed version, channel, CHANGELOG section and README changes. Work on a branch; never commit on `main`.

```bash
git switch -c release/<version>
git add CHANGELOG.md README.md
git diff --cached --quiet || git commit -m "docs: changelog for <version>"
```

**Beta**:

```bash
pnpm version preminor --preid beta --no-git-tag-version     # first beta: or prepatch / premajor, from the bump in step 2
pnpm version prerelease --preid beta --no-git-tag-version   # next beta of the same version
git add package.json
git commit -m "chore(release): <version>"
```

Check: `git show --stat HEAD` lists only `package.json`; `manifest.json` and `versions.json` are unchanged. npm numbers the first beta `-beta.0`.

**Stable** (directly, or from a beta):

When promoting a beta, first check what reached `main` after it was tested:

```bash
git diff --stat <beta>..origin/main -- src   # stylesheets live in src/styles
```

Not empty: tell the user which code is untested and ask whether to cut another beta or release stable anyway. Then:

```bash
pnpm version <patch|minor|major> --no-git-tag-version   # from 0.5.0-beta.2, minor gives 0.5.0
git add package.json manifest.json versions.json
git commit -m "chore(release): <version>"
```

Check: `git show --stat HEAD` lists `package.json`, `manifest.json`, `versions.json`; `versions.json` gained the new version. In every case `git tag --list <version>` is empty.

## 6. PR, merge = release

Each outward step needs the user's explicit go-ahead (`CLAUDE.md`): push the branch, open the PR, merge it. Ask for each, naming the version and channel. The merge publishes; there is no later step to ask about.

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

- **Beta**: the release is a pre-release, not "Latest", and the attached `manifest.json` carries the beta version (`gh release download <version> -p manifest.json -O - | grep version`).
- **Stable**: the release is "Latest".
- **Run skipped the release job** ("nothing to release"): the version was released before, or the bump did not change a version; the bump was wrong.
- **Run failed** on a transient error: `gh run rerun <run-id> --failed`; a rerun builds the same commit.
- **Gate failed in the run**: nothing was published. Fix it in a `fix:` PR that also adds the fix to the CHANGELOG, merge, then start the workflow from the Actions tab (`workflow_dispatch`, ref `main`); it tags `main`'s head.
- **Workflow did not fire**: see "Release workflow did not fire" in `versioning-releases.md`. Never create the release by hand; that skips the build attestation.

Report the release URL and the asset list to the user.

## 7. Test on the user's devices

Other devices install the plugin only from a published release, so this test follows the release. Never ask before the merge whether other platforms or a real phone or tablet were tested.

- **After a beta**: hand over to the user: install the beta through BRAT (add `Macavity/obsidian-hoard`, allow pre-releases) on the other desktop platforms and a real phone or tablet, and try it with a large vault. A problem found there is fixed on `main` and goes out as the next beta. When the user approves the beta by name, promote it (steps 1–6, channel "stable from a beta").
- **After a direct stable release**: hand over the same test with the directory or BRAT release. A regression found there gets a new release through this skill, not a fix to the published tag.

## Rationalizations that end releases badly

- "Tiny change, skip the gate." The gate runs on every release. Skip only on the user's instruction, and say so.
- "Smoke or mobile:smoke does not run right now, skip it." Both are part of the gate; a release waits for them.
- "Obsidian is not running, I'll ask the user." Start it yourself with `pnpm vault:open` first; ask only when that fails.
- "I'll pick the channel myself." Version and channel are proposed and confirmed together.
- "The beta looked fine, I'll promote it." Only the user approves a beta, by name, after testing it.
- "I'll write the notes into the tag or commit message instead." The workflow reads only `CHANGELOG.md`.
- "It's a hotfix, skip the changelog." Only when the user says so; one `### Fixed` line takes a minute.
- "The README was touched in the PR, it's current." Read the sections named in step 4 against the change.
- "It's only the version bump, I'll commit it on `main`." Never; release branch and PR.
- "I'll tag it myself, it's faster." The workflow tags the merge commit; a hand tag can point at a commit the PR never covered.
- "The user said release, that covers the merge." Version, channel, CHANGELOG and README are confirmed first; push, PR and merge each separately.
- "CI is still running, the merge button works." The merge publishes; wait for green checks.
- "CI was green on the PR." The merge commit is a different tree; run the gate on `main`.

Red-flag phrases: "should be fine", "I'll just", "basically the same as the PR", "no need to wait for the run".
