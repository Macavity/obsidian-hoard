# Contributing

Thanks for your interest in contributing to Hoard.

## Development setup

```bash
pnpm install
pnpm dev        # watch build
pnpm build      # typecheck + production build
```

Build artifacts (`main.js`, `manifest.json`, `styles.css`) are produced in `dist/`; `manifest.json` is copied there from the repo root and `styles.css` is bundled from the partials in `src/styles/` (`index.css` `@import`s them in cascade order; both are rebuilt on change during `pnpm dev`).

## Testing

- Unit: `pnpm test` (vitest + happy-dom, `obsidian` mocked in `test/__mocks__/obsidian.ts`). `pnpm check` = typecheck + lint + test + quality.
- Integration: `pnpm smoke` runs against the versioned vault `hoard-test-vault/`, never against a working vault. All CLI calls go through `scripts/lib/cli.mjs`, which always passes `vault="hoard-test-vault"` and aborts unless that vault is registered at the main checkout's `hoard-test-vault` (override with `HOARD_TEST_VAULT`). Git worktrees share that vault: `vault:reset` mirrors the worktree's fixtures into it and `vault:link-test` points the plugin symlink at the worktree's `dist/`.

Test vault setup (once):

1. `pnpm vault:link-test` creates the symlink `hoard-test-vault/.obsidian/plugins/hoard` -> `dist/` (a symlink, not a Finder alias).
2. `pnpm vault:open`, confirm "Open folder as vault" in Obsidian, turn off Restricted mode and make sure `hoard` is enabled.
3. `pnpm dev` in one terminal; `pnpm reload` after each rebuild.

CLI calls time out after 30 s; keep the hoard-test-vault window visible while running `pnpm smoke`, otherwise Chromium throttling causes timeouts. If Obsidian hangs, run `obsidian vault="hoard-test-vault" reload` and `pnpm vault:reset`.

`pnpm vault:reset` disables `hoard` and removes any modal left open. It then restores `hoard-test-vault/` to `HEAD`, removes untracked files and, from a worktree, mirrors the result into the registered vault (the plugin symlink, themes, `workspace*.json`, cache and `.trash` stay). It writes the seed `scripts/fixtures/hoard-data.json` as `data.json` into the folder the plugin symlink points to (possibly another worktree's `dist/`), waits until Obsidian's index matches the disk and enables `hoard` again. The seed declines both WatchLog imports, so the onboarding wizard stays closed. To try the wizard by hand, remove `ui.watchlogImport` from that `data.json` and run `pnpm reload`.

### Fixtures

The notes in `hoard-test-vault/` are hand-written and cover every domain plus edge cases (broken properties, a minimal note, `Maybe`, a 2099 airtime, foreign History lines, drafts). `Welcome.md` catalogues each one and what it covers. No fixture has an external id, and the anime fixture and the click-flow edit target (Severance) have `Cover: none`, so the background cover fill leaves them alone. `test/e2e/expected.mjs` holds the counts the smoke expects; change a fixture and its count in the same commit (`test/fixtures.test.ts` checks them against the codecs).

### Smoke

`pnpm smoke [--only <step>]` runs `vault:link-test`, `vault:reset`, `build` and `reload`, then these steps, and resets the vault at the end. It needs a running Obsidian with the test vault window visible; it does not run in CI.

| Step | Checks |
|---|---|
| `data` | the managers load exactly the counts in `expected.mjs`; no wizard open |
| `flows` | real clicks (`test/e2e/ui.mjs`, CDP with hit-testing) add a title, tick an episode and change a status, edit the detail modal; the note on disk may change only in the expected properties |
| `scenarios` | the WatchLog wizard imports `test/e2e/scenarios/watchlog-{original,fork}` into an empty vault; your own WatchLog data in the vault is restored afterwards |
| `keyless` | needs the network: without API keys the add modals find, fill and add The Matrix, Breaking Bad (Cinemeta), The Hobbit (Open Library) and Hades (Steam); each note on disk has the expected `External ID` and a `Cover`. Runs last, since it adds notes |

Failures collect per step; a screenshot of each failed flow or scenario goes to `$SMOKE_OUT` (default `<os tmpdir>/hoard-smoke`).

A new scenario is a folder `test/e2e/scenarios/<name>/` with a complete `vault/`, an optional `data.json` (Hoard's local data; without it no import decision is stored) and a flow; register it in `test/e2e/steps/scenarios.mjs`.

### Visual regression

`pnpm visual:shots <label> [--only <id-prefix>] [--variants light-desktop,dark-desktop,light-phone,dark-phone] [--screenshots]` deploys like the smoke, then writes a computed-style dump (no class names) of every state of `test/visual/states.mjs` into `$VISUAL_OUT/<label>/<variant>/` (default `<os tmpdir>/hoard-visual`, default variant `light-desktop`). The dump leaves the Obsidian window in the background; `--screenshots` adds a PNG per state and brings the window to the front for each one, so use it with `--only` for the states whose look is meant to change. States marked `foreground` (the widgets note) are captured only with `--screenshots`. `pnpm visual:diff <before> <after> [--notes <file>]` compares two captures, writes `report-<before>-<after>/report.html` and exits 1 when anything changed; the notes file is JSON `{ "<variant>/<id>": { "verdict": "expected" | "open", "reason": "…" } }`. Two captures of unchanged code must differ nowhere. The catalogue roots may only use `hoard-view`, Obsidian's own classes or `data-visual-root`, so they survive a class rename.

Themes: `pnpm vault:theme <label|default>` switches the test vault to a theme from `scripts/themes.json` (downloaded on first use into `hoard-test-vault/.obsidian/themes/`, not versioned). Check any change to `src/styles/` against a few of them, light and dark.

To install the build into a real vault, `pnpm vault:link [vault-name]` copies `dist/` into that vault's plugin folder.

## Code quality

[Fallow](https://fallow.tools) measures dead code, duplication and complexity; the policy lives in `.fallowrc.json`.

- `pnpm quality` analyzes the whole repo and must pass before you open a PR. The repo is kept clean: no unused exports, no duplicates, no function above the default thresholds (cyclomatic 20, cognitive 15, CRAP 30).
- `pnpm quality:audit` checks only the files you changed against `main` and fails on findings your change introduces. CI runs the same audit on every PR and posts a summary comment; pushes to `main` run the full analysis.
- In Claude Code, `.claude/hooks/fallow-gate.sh` runs the audit before every `git commit`/`git push` and blocks on a `fail` verdict (needs `jq`).
- Handle findings in this order: fix the code; model an intentional exception in `.fallowrc.json` (`entry`, `usedClassMembers`, `ignoreDependencies`); only as a last resort suppress one line with `// fallow-ignore-next-line <issue> -- reason`. Never raise thresholds to hide a hotspot.

## Local checks

Run `pnpm check` before you push: typecheck, lint, unit tests and the fallow quality analysis in one go. The individual steps (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm quality`) exist for quick iteration.

`pnpm lint` mirrors the Obsidian review bot: every `eslint-disable` needs a `-- reason`, some rules can never be disabled (`scripts/lib/eslint-disables.mjs`), and every class in `src/styles/*.css` must be referenced from `src/` (`scripts/check-css-classes.mjs`).

## Community plugin scanner

Obsidian's plugin directory lints every submitted plugin with `eslint-plugin-obsidianmd`. Its adjustments to the recommended config are documented in the plugin's [configuration page](https://github.com/obsidianmd/eslint-plugin/blob/master/docs/configuration.md#community-plugin-scanner-configuration). What matters here:

- It skips `**/i18n/**`, `**/scripts/**`, `**/test/**`, `**/docs/**` and all `.mjs` files, so locale texts and tooling are never linted.
- It switches the three sentence-case rules off. We have them off as well: casing of UI text is a writing convention, described under "Adding or changing a string" in [docs/architecture/i18n.md](docs/architecture/i18n.md).
- For newly submitted plugins `no-static-styles-assignment`, `settings-tab/no-manual-html-headings`, `platform`, `no-unsupported-api` and a few more are errors.

`pnpm lint:bot` applies that documented configuration to the tracked sources and prints the findings per rule and level (information only, exit code 0; `--list` adds file and line). It is a reading of the documentation with the plugin version installed here, not the scanner itself, so it can lag behind. Current result: no error, one warning (`settings-tab/prefer-setting-definitions`, the declarative settings API, tracked separately).

## Pull requests

- Keep changes focused; one topic per PR.
- Run `pnpm check` and `pnpm build` before submitting; CI will run these too.
- Pull requests that change user-visible behaviour add a line under `## [Unreleased]` in `CHANGELOG.md`.

## Releases

Maintainers cut releases with `pnpm version <patch|minor> --no-git-tag-version` (updates `manifest.json` and `package.json`; `versions.json` gains a key only when `minAppVersion` changes), move the `Unreleased` section of `CHANGELOG.md` under the new version, check the README, commit on a `release/<version>` branch and merge it through a PR. Merging publishes: the release workflow reruns the gate, tags the merge commit with the bare version, builds and attaches `main.js`, `manifest.json`, and `styles.css` from `dist/` with build provenance attestation and uses the version's `CHANGELOG.md` section as the release notes. Agents follow `.claude/skills/release/SKILL.md`.
