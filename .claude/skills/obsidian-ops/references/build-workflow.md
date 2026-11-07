<!--
Source: this repo's package.json and esbuild.config.mjs
-->

# Build Workflow

After any code change, run:

```bash
pnpm build   # tsc --noEmit (type check) + esbuild production build → main.js
pnpm lint    # must pass with zero warnings
```

During development, `pnpm dev` rebuilds `main.js` on every change (with inline source maps). Reload the plugin in Obsidian afterwards.

## What the build does

- `tsc -noEmit -skipLibCheck`: type check only, no output.
- `node esbuild.config.mjs build`: bundles `src/main.ts` into `main.js` at the repo root.
- `main.js` is gitignored; releases attach it as an asset.

## Lint

`pnpm lint` runs `scripts/lint-wrapper.mjs`, which:

1. rejects `eslint-disable` comments without a `-- reason`,
2. rejects disabling rules the review bot forbids to disable,
3. runs ESLint with `eslint-plugin-obsidianmd` and `--max-warnings 0`.

## Automated Workflow

1. Make the code change
2. **Immediately run `pnpm build` and `pnpm lint`**
3. Fix errors, repeat until both pass
4. Then test in Obsidian
