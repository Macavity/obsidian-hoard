<!--
Source: https://github.com/obsidianmd/obsidian-sample-plugin, https://docs.obsidian.md/Plugins/Getting+started/Mobile+development
-->

# Troubleshooting

## Plugin issues

- **Plugin doesn't appear**: `main.js` and `manifest.json` must be at the top level of `<Vault>/.obsidian/plugins/<plugin-id>/`, and the folder name should match `manifest.id`. A macOS Finder alias is not followed; use a symlink.
- **Changes not visible**: Is `pnpm dev` running? Reload the plugin (disable/enable) or the app.
- **Plugin fails to load**: Open DevTools (Cmd+Opt+I / Ctrl+Shift+I) and check the console for errors from `onload()`.
- **Works on desktop, breaks on mobile**: Node.js/Electron API used (e.g. `fs`, `path`, `require("electron")`), or regex lookbehind on iOS < 16.4. Test with `app.emulateMobile(true)`.
- **Styles not applied**: `styles.css` must sit next to `main.js` in the plugin folder; check class names and specificity in DevTools.
- **Settings lost**: `loadData()` returns `null` on first run; merge with defaults (`Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`).

## AI Agent Issues

### .ref Folder Not Found

**Problem**: AI agent can't find `.ref` folder when searching.

**Solution**:
- The `.ref` folder is gitignored and may be hidden
- List the project root including hidden entries (`ls -a`)
- Glob for `.ref/**`
- Try direct paths like `.ref/obsidian-api/README.md`

**For AI agents**: When user asks about `.ref`, actively search using multiple methods. Don't assume it doesn't exist if first search fails.

## Common Error Messages

### Build Errors

- **TypeScript errors**: Run `pnpm build` and fix the reported types; `tsc` runs before esbuild.
- **"Could not resolve …"**: Missing dependency (`pnpm install`) or a wrong import path.
- **Lint failures**: See [scorecard-compliance.md](scorecard-compliance.md) for obsidianmd rules; never silence them with undescribed `eslint-disable` comments.

## Debugging Techniques

- **Console**: `console.debug` for development output (only `warn`, `error`, `debug` are allowed by lint).
- **Inspect the plugin**: `app.plugins.plugins["<plugin-id>"]` in the DevTools console.
- **Breakpoints**: `pnpm dev` emits inline source maps, so `src/` files are visible in the Sources panel.
