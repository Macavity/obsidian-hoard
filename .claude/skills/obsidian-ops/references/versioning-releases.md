<!--
Source: https://github.com/obsidianmd/obsidian-sample-plugin, https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions, https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
-->

# Versioning & releases

**Before releasing**: Use the [release-readiness.md](release-readiness.md) checklist.

- Bump the version with `pnpm version <patch|minor|major> --no-git-tag-version`. This updates `package.json` and runs `version-bump.mjs`, which writes the new version to `manifest.json` and, if `minAppVersion` changed, adds an entry to `versions.json`. Then commit and create the tag yourself.
  - Without `--no-git-tag-version`, `pnpm version` (= `npm version`) commits and tags automatically, and the tag gets a `v` prefix, which breaks the rule below.
- The GitHub release tag must equal `manifest.json`'s `version` exactly. No leading `v`.
- Attach `main.js`, `manifest.json` and `styles.css` (if present) as individual release assets.
- First publication: submit the plugin via the [community directory](https://community.obsidian.md/) (sign in, link GitHub, add the plugin). The directory reads `manifest.json` from the HEAD of the default branch and runs an automated review; fix findings by publishing a new release.

### Automated releases with build provenance attestation

The community scorecard penalizes releases whose assets lack a GitHub artifact attestation. This repo's `.github/workflows/release.yml` handles it: on a tag push (or manual `workflow_dispatch`) it installs with pnpm, runs `pnpm build`, reads the version from `manifest.json`, attests the assets with `actions/attest-build-provenance`, and creates or updates the release.

**Why read the version from `manifest.json`**: the workflow runs from either a tag push (where `github.ref_name` is the tag) or a `workflow_dispatch` from a branch (where `github.ref_name` is the branch name, e.g. `master`). Using `github.ref_name` directly would title a manually-triggered release after the branch. Reading from `manifest.json` is consistent across both triggers and matches what Obsidian's plugin loader actually reads.

**Why the release notes come from `CHANGELOG.md` instead of `--generate-notes` or the commit message**: `--generate-notes` produces a PR list plus compare link with no context, and the commit history is not curated enough to serve as notes. The workflow extracts the `## [<version>]` section from `CHANGELOG.md` (Keep a Changelog format) and warns when that section is missing (a hotfix may ship with the compare link alone; the notes can be edited on GitHub afterwards). The compare link is still appended underneath for the full diff. `fetch-depth: 0` is required so `git tag --merged HEAD` has the tag history to find the previous version.

Cut releases by pushing a tag (`git tag 0.1.0 && git push origin 0.1.0`). The workflow attaches the three required assets and registers the attestation. The scorecard's "Build verified" signal also fires once the workflow has run, because the attested artifacts can be reproduced byte-for-byte from source.

For the full set of scorecard signals and their fixes, see [scorecard-compliance.md](scorecard-compliance.md).

### Pushing tags so the workflow actually fires

Push order matters. Push commits to the default branch **first**, in a separate command, then push the tag. If you push both in a single batch (`git push --tags --follow-tags` or some GUIs), GitHub occasionally processes the tag webhook before indexing the workflow file at that ref, and the trigger silently drops.

```bash
git push origin main             # commits first
# pause a few seconds
git push origin 0.1.0            # tag in a separate command
```

If the workflow does not fire on a tag push, diagnose with:

```bash
gh api repos/:owner/:repo/actions/runs --jq '.workflow_runs[0:5] | .[] | {id, event, status, conclusion, head_branch, created_at}'
gh workflow list
gh api repos/:owner/:repo/actions/permissions/workflow
```

If `gh api .../runs` is empty for the tag, the trigger was dropped. Recovery options:

- **Add `workflow_dispatch:` to the trigger** so you can re-run from the Actions tab without a re-push.
- **Re-push the tag**: `git push origin :refs/tags/0.1.0 && git push origin 0.1.0`.
- **Manually create the release** in the GitHub UI. The release will exist but it will not have the build provenance attestation, which costs scorecard points until the next release.
