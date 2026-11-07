<!--
Source: Condensed from the other references in this skill set
-->

# Quick Reference

One-page cheat sheet for this plugin.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Watch build | `pnpm dev` |
| Production build + type check | `pnpm build` |
| Lint | `pnpm lint` / `pnpm lint:fix` |
| Bump version | `pnpm version patch\|minor\|major --no-git-tag-version` (updates `package.json`, `manifest.json`, `versions.json`) |
| Look up API | search `node_modules/obsidian/obsidian.d.ts` (or `.ref/obsidian-api/` if set up) |

## Shortcuts for agents

- `release ready?` → run the checklist in [release-readiness.md](release-readiness.md)
- `summarize` / `summarize for release` → see [summarize-commands.md](summarize-commands.md)

## File paths

```text
<Vault>/.obsidian/plugins/<plugin-id>/
  ├── main.js
  ├── manifest.json
  └── styles.css
```

## Release

1. `pnpm build && pnpm lint` pass, [release-readiness.md](release-readiness.md) checked
2. `pnpm version <patch|minor|major> --no-git-tag-version`, commit, `git tag <version>`
3. Push commits, then push the tag separately (tag = `manifest.json` version, no `v`)
4. `.github/workflows/release.yml` builds, attests and attaches the assets

Details: [versioning-releases.md](versioning-releases.md).

## Reference repos (`.ref/`)

Optional: `scripts/setup-ref-links.sh` symlinks the core Obsidian repos (API, docs, sample plugin, ESLint plugin) into `.ref/`. Update them with `git pull` in the central `.ref/obsidian-dev` location.
