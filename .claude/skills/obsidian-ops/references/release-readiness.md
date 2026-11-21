<!--
Source: https://docs.obsidian.md/community-directory/developer-policies, https://docs.obsidian.md/community-directory/submission-requirements-for-plugins, https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines, https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
-->

# Release Readiness Checklist

Use this when preparing a release or when asked "is the plugin ready for release?".

## Quick Reference

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies)
- [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) (local summary: [plugin-guidelines.md](../../obsidian-dev/references/plugin-guidelines.md))

## Automated Checks (agent can verify)

### Files

- [ ] `manifest.json`, `README.md`, `LICENSE` at the repo root
- [ ] `pnpm build` produces `main.js` without errors
- [ ] `styles.css` present if the plugin ships CSS

### Manifest

- [ ] Passes the checklist in [manifest.md](../../obsidian-ref/references/manifest.md)
- [ ] `package.json` equals `manifest.json`, or is a beta above it; `versions.json` lists every stable version with its `minAppVersion` and no beta (checked by `test/releaseVersions.test.ts`)
- [ ] No Obsidian API newer than `minAppVersion` is used (checked by `test/minAppVersion.test.ts`)
- [ ] `isDesktopOnly: true` if any Node.js/Electron API is used (grep for `fs`, `path`, `electron`, `require(`)

### Code

- [ ] `pnpm lint` passes with zero warnings (same rules as the review bot)
- [ ] `pnpm quality` passes (full fallow analysis; CI only audits PRs)
- [ ] No sample/placeholder code left (`MyPlugin`, `SampleSettingTab`, demo commands)
- [ ] Command IDs don't include the plugin ID (Obsidian prefixes them)
- [ ] No `innerHTML`/`outerHTML`/`insertAdjacentHTML` with untrusted input
- [ ] Everything registered in `onload()` is cleaned up on unload
- [ ] No unnecessary console output

### Policies

- [ ] No obfuscated code, no client-side telemetry, no dynamic ads, no self-updating
- [ ] README discloses, if applicable: payment, account requirement, network use (which services, why), file access outside the vault, static ads, server-side telemetry (with privacy policy link)
- [ ] LICENSE present; third-party code licenses respected and attributed in README
- [ ] "Obsidian" not used in a way that suggests a first-party plugin

### README

- [ ] Explains what the plugin does and how to use it (excerpts appear in the directory)
- [ ] Screenshots or GIFs for UI features (recommended)

## Interactive Checks (ask the user)

Before every release, beta or stable, on the development machine only (the agent runs these, no question needed; both are mandatory):

- [ ] Mobile layout covered by desktop emulation (`pnpm mobile:smoke`), or `isDesktopOnly: true`
- [ ] `pnpm smoke` against `hoard-test-vault`; if Obsidian is not running, the agent starts it with `pnpm vault:open` and asks only when that fails

After the release (other desktops and mobile devices install plugins only from a published release, through BRAT or the directory, so none of this can be a precondition). After a beta these tests decide whether it is promoted to stable; after a direct stable release they follow it:

- [ ] Release created with tag = version, assets `main.js`, `manifest.json`, `styles.css` attached individually; a beta is a pre-release whose `manifest.json` asset carries the beta version
- [ ] Tested on the other desktop platforms (Windows / macOS / Linux) from that release
- [ ] Tested on Android / iOS from that release
- [ ] Tested with a large vault and with other plugins disabled
- [ ] A regression found there goes out as the next beta or a patch release

## Agent workflow

1. Run the automated checks, report pass/fail/warning per item with concrete fixes.
2. Run the local pre-release checks; leave the after-release items for after the tag.
3. If ready, continue with [versioning-releases.md](versioning-releases.md).

## Related Documentation

- [versioning-releases.md](versioning-releases.md)
- [security-privacy.md](security-privacy.md)
- [scorecard-compliance.md](scorecard-compliance.md)
- [testing.md](testing.md)
- [ux-copy.md](../../obsidian-ref/references/ux-copy.md)
