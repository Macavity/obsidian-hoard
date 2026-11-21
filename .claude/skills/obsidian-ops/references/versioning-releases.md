<!--
Source: https://github.com/obsidianmd/obsidian-sample-plugin, https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions, https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
-->

# Versioning & releases

**Before releasing**: Use the [release-readiness.md](release-readiness.md) checklist.

- Two channels share `main`. `manifest.json` holds the **stable** version, the only one the community directory reads. `package.json` holds the newest version, which may be a **beta** (`0.5.0-beta.0`), published as a GitHub pre-release for BRAT.
- Bump a stable version with `pnpm version <patch|minor|major> --no-git-tag-version`. This updates `package.json` and runs `version-bump.mjs`, which writes the new version to `manifest.json` and always adds it to `versions.json` with the current `minAppVersion`. Obsidian uses `versions.json` only to offer an older plugin version to an app older than `minAppVersion`: it picks the highest listed version whose minimum fits, so every stable version is listed and no beta.
- Bump a beta with `pnpm version preminor|prepatch|premajor --preid beta --no-git-tag-version` (first beta) or `pnpm version prerelease --preid beta --no-git-tag-version` (next one). Only `package.json` changes.
- Commit; the release workflow creates the tag when the bump reaches `main`. `test/releaseVersions.test.ts` checks on every PR that `package.json` equals `manifest.json` or is a beta above it, and that `versions.json` fits.
  - Without `--no-git-tag-version`, `pnpm version` (= `npm version`) commits and tags automatically, and the tag gets a `v` prefix, which breaks the rule below.
- The GitHub release tag must equal the released version exactly (`manifest.json`'s for stable, `package.json`'s for a beta). No leading `v`.
- Attach `main.js`, `manifest.json` and `styles.css` (if present) as individual release assets.
- First publication: submit the plugin via the [community directory](https://community.obsidian.md/) (sign in, link GitHub, add the plugin). The directory reads `manifest.json` from the HEAD of the default branch and runs an automated review; fix findings by publishing a new release.

### Automated releases with build provenance attestation

The community scorecard penalizes releases whose assets lack a GitHub artifact attestation. This repo's `.github/workflows/release.yml` handles it. It runs on a push to `main` that changes `manifest.json` or `package.json`, on a tag push, and on manual `workflow_dispatch`. A `check` job runs `scripts/release-decide.mjs` (logic in `scripts/lib/release-versions.mjs`): it fails on inconsistent version files, then releases stable when `manifest.json`'s version has no tag, beta when `package.json` holds an untagged prerelease, and nothing otherwise (a dependency-only change to `package.json`). A pushed tag must match one of the two versions; `workflow_dispatch` with nothing new re-uploads the stable assets. A beta gets its own version stamped into the `manifest.json` asset and is created with `--prerelease --latest=false`. The `release` job installs with pnpm, runs typecheck, lint, test and build, attests the assets with `actions/attest-build-provenance`, and creates or updates the release; `gh release create --target $GITHUB_SHA` creates the tag on the built commit when it does not exist yet.

**Why the merge publishes**: merging the release PR already is the approval. A separate tag push would only ask for it twice. The workflow reruns the gate itself because `main` has no required checks, so a PR can be merged while its CI is still running. A tag created with `GITHUB_TOKEN` starts no further workflow, which is why tagging and publishing happen in the same run.

**Why read the version from the files**: the workflow runs from a push to `main` or a `workflow_dispatch` from a branch (where `github.ref_name` is the branch name) or a tag push (where it is the tag). Using `github.ref_name` directly would title the release after the branch. Reading from `manifest.json` and `package.json` is consistent across all triggers (a pushed tag that matches neither fails the run) and matches what Obsidian's plugin loader actually reads.

**Why the release notes come from `CHANGELOG.md` instead of `--generate-notes` or the commit message**: `--generate-notes` produces a PR list plus compare link with no context, and the commit history is not curated enough to serve as notes. The workflow extracts the `## [<version>]` section from `CHANGELOG.md` (Keep a Changelog format; a beta takes `## [Unreleased]`) and warns when that section is missing (a hotfix may ship with the compare link alone; the notes can be edited on GitHub afterwards). The compare link is still appended underneath for the full diff. `fetch-depth: 0` is required so `git tag --merged HEAD` has the tag history to find the previous version; a stable release compares against the previous stable, not its last beta.

Cut releases by merging a release PR that bumps `package.json` for a beta or `manifest.json` for stable (see the `release` skill). The workflow attaches the three required assets and registers the attestation. The scorecard's "Build verified" signal also fires once the workflow has run, because the attested artifacts can be reproduced byte-for-byte from source.

For the full set of scorecard signals and their fixes, see [scorecard-compliance.md](scorecard-compliance.md).

### Release workflow did not fire

Diagnose with:

```bash
gh api repos/:owner/:repo/actions/runs --jq '.workflow_runs[0:5] | .[] | {id, event, status, conclusion, head_branch, head_sha, created_at}'
gh workflow list
gh api repos/:owner/:repo/actions/permissions/workflow
```

- No run for the merge commit: the merge changed neither `manifest.json` nor `package.json` (wrong bump, or the bump landed earlier). Check `git show --stat <merge>`.
- Run present, `release` job skipped: every version was already tagged. Expected for a dependency-only change to `package.json`.
- Recovery: start the workflow from the Actions tab (`workflow_dispatch`, ref `main`); it tags `main`'s head when the tag is missing.
- **Last resort, manually create the release** in the GitHub UI. The release will exist but it will not have the build provenance attestation, which costs scorecard points until the next release.
