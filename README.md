# Hoard

Obsidian plugin. Based on [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus).

## Development

```bash
pnpm install
pnpm dev     # watch build
pnpm build   # typecheck + production build
pnpm lint
```

`pnpm check` runs typecheck, lint, unit tests and the fallow quality analysis. Build output lands in `dist/`; `pnpm vault:link` installs it into a vault. See CONTRIBUTING.md for the test vault and smoke tests.

## Release

```bash
pnpm version patch|minor|major
git push --follow-tags
```

The GitHub workflow in `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json` and `styles.css` to the tagged release.
