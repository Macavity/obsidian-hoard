// Restores this checkout's hoard-test-vault/ to HEAD, removes untracked files and, from a worktree, mirrors the result into the
// registered vault (the main checkout's hoard-test-vault). Obsidian's local state (plugins/, themes/, workspace*.json, cache, .trash)
// stays. A running Obsidian picks up the restored appearance.json itself and switches back to the default theme.
// Also writes the versioned plugin seed (scripts/fixtures/hoard-data.json) into the folder the vault's plugin link points to
// (falling back to this checkout's dist/); the seed declines both WatchLog imports so the onboarding wizard stays closed.
// All of it runs with the plugin disabled, so it neither reacts to the changed files nor flushes over the seed, and the plugin
// only comes back once Obsidian's index matches the disk.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, REPO, VAULT_PATH } from "./lib/cli.mjs";
import { withPluginDisabled } from "./lib/plugin-toggle.mjs";
import { pluginDataDir, writeSeed } from "./lib/seed.mjs";
import { waitForVaultIndex } from "./lib/vault-index.mjs";
import { syncVault } from "./lib/vault-sync.mjs";

const git = (...a) => execFileSync("git", a, { cwd: REPO, stdio: "inherit" });
const target = pluginDataDir(VAULT_PATH, join(REPO, "dist"));
await withPluginDisabled(async (live) => {
	git("restore", "--source=HEAD", "--staged", "--worktree", "--", "hoard-test-vault");
	git("clean", "-fdq", "--", "hoard-test-vault");
	if (realpathSync(VAULT_PATH) !== realpathSync(FIXTURES)) syncVault(FIXTURES, VAULT_PATH);
	writeSeed(target);
	if (live) await waitForVaultIndex();
});
console.log(`hoard-test-vault reset${realpathSync(VAULT_PATH) === realpathSync(FIXTURES) ? "" : ` and mirrored into ${VAULT_PATH}`}; plugin data seeded in ${target}`);
