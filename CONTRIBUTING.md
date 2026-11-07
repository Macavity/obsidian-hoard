# Contributing

Thanks for your interest in contributing to Hoard.

## Development setup

```bash
pnpm install
pnpm dev        # watch build
pnpm build      # typecheck + production build
```

Build artifacts (`main.js`, `manifest.json`, `styles.css`) are produced in `dist/`; `manifest.json` and `styles.css` are copied there from the repo root (also on change during `pnpm dev`).

## Testing

- Unit: `pnpm test` (vitest + happy-dom, `obsidian` mocked in `test/__mocks__/obsidian.ts`). `pnpm check` = typecheck + lint + test + quality.
- Integration: `pnpm smoke` runs against the versioned vault `test-vault/`, never against a working vault. All CLI calls go through `scripts/lib/cli.mjs`, which always passes `vault="test-vault"` and aborts unless that vault is registered at the main checkout's `test-vault` (override with `HOARD_TEST_VAULT`). Git worktrees share that vault: `vault:reset` mirrors the worktree's fixtures into it and `vault:link-test` points the plugin symlink at the worktree's `dist/`.

Test vault setup (once):

1. `pnpm vault:link-test` creates the symlink `test-vault/.obsidian/plugins/hoard` -> `dist/` (a symlink, not a Finder alias).
2. `pnpm vault:open`, confirm "Open folder as vault" in Obsidian, turn off Restricted mode and make sure `hoard` is enabled.
3. `pnpm dev` in one terminal; `pnpm reload` after each rebuild.

CLI calls time out after 30 s; keep the test-vault window visible while running `pnpm smoke`, otherwise Chromium throttling causes timeouts. If Obsidian hangs, run `obsidian vault="test-vault" reload` and `pnpm vault:reset`.

`pnpm vault:reset` restores `test-vault/` to `HEAD`, removes untracked files and, from a worktree, mirrors the result into the registered vault (the plugin symlink, themes, `workspace*.json`, cache and `.trash` stay). Change fixtures only in a commit.

Themes: `pnpm vault:theme <label|default>` switches the test vault to a theme from `scripts/themes.json` (downloaded on first use into `test-vault/.obsidian/themes/`, not versioned). Check any change to `styles.css` against a few of them, light and dark.

To install the build into a real vault, `pnpm vault:link [vault-name]` copies `dist/` into that vault's plugin folder.

## Code quality

[Fallow](https://fallow.tools) measures dead code, duplication and complexity; the policy lives in `.fallowrc.json`.

- `pnpm quality` analyzes the whole repo and must pass before you open a PR. The repo is kept clean: no unused exports, no duplicates, no function above the default thresholds (cyclomatic 20, cognitive 15, CRAP 30).
- `pnpm quality:audit` checks only the files you changed against `main` and fails on findings your change introduces. CI runs the same audit on every PR and posts a summary comment; pushes to `main` run the full analysis.
- In Claude Code, `.claude/hooks/fallow-gate.sh` runs the audit before every `git commit`/`git push` and blocks on a `fail` verdict (needs `jq`).
- Handle findings in this order: fix the code; model an intentional exception in `.fallowrc.json` (`entry`, `usedClassMembers`, `ignoreDependencies`); only as a last resort suppress one line with `// fallow-ignore-next-line <issue> -- reason`. Never raise thresholds to hide a hotspot.

## Local checks

Run `pnpm check` before you push: typecheck, lint, unit tests and the fallow quality analysis in one go. The individual steps (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm quality`) exist for quick iteration.

`pnpm lint` mirrors the Obsidian review bot: every `eslint-disable` needs a `-- reason`, some rules can never be disabled (`scripts/lib/eslint-disables.mjs`), and every class in `styles.css` must be referenced from `src/` (`scripts/check-css-classes.mjs`).

## Pull requests

- Keep changes focused; one topic per PR.
- Run `pnpm check` and `pnpm build` before submitting; CI will run these too.
- Pull requests that change user-visible behaviour add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releases

Maintainers cut releases with `pnpm version <patch|minor> --no-git-tag-version` (updates `manifest.json` and `package.json`; `versions.json` gains a key only when `minAppVersion` changes), move the `Unreleased` section of `CHANGELOG.md` under the new version, check the README, commit, then tag with the bare version and push the tag. The release workflow builds and attaches `main.js`, `manifest.json`, and `styles.css` from `dist/` with build provenance attestation and uses the version's `CHANGELOG.md` section as the release notes. Agents follow `.claude/skills/release/SKILL.md`.
