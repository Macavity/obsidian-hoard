// Restores this checkout's hoard-test-vault/ to HEAD, removes untracked files and, from a worktree, mirrors the result into the
// registered vault (the main checkout's hoard-test-vault). Obsidian's local state (plugins/, themes/, workspace*.json, cache, .trash)
// stays. A running Obsidian picks up the restored appearance.json itself and switches back to the default theme.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { FIXTURES, REPO, VAULT_PATH } from "./lib/cli.mjs";
import { syncVault } from "./lib/vault-sync.mjs";

const git = (...a) => execFileSync("git", a, { cwd: REPO, stdio: "inherit" });
git("restore", "--source=HEAD", "--staged", "--worktree", "--", "hoard-test-vault");
git("clean", "-fdq", "--", "hoard-test-vault");
if (realpathSync(VAULT_PATH) === realpathSync(FIXTURES)) {
	console.log("hoard-test-vault reset");
} else {
	syncVault(FIXTURES, VAULT_PATH);
	console.log(`hoard-test-vault reset and mirrored into ${VAULT_PATH}`);
}
