# Hoard

Obsidian plugin. Based on [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus).

## Development

```bash
pnpm install
pnpm dev     # watch build
pnpm build   # typecheck + production build
pnpm lint
```

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/hoard/` or symlink the repo there.

## Release

```bash
pnpm version patch|minor|major
git push --follow-tags
```

The GitHub workflow in `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json` and `styles.css` to the tagged release.
