// Waits for Obsidian's file index to catch up with files changed on disk behind its back.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { evalJs, VAULT_PATH, waitFor } from "./cli.mjs";

/** Vault-relative paths of the visible files on disk (Obsidian indexes no dot files or folders). */
export function diskFiles(dir, rel = "") {
	return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
		if (e.name.startsWith(".")) return [];
		const path = rel ? `${rel}/${e.name}` : e.name;
		return e.isDirectory() ? diskFiles(dir, path) : [path];
	});
}

/** Waits until Obsidian's file index matches the disk. Re-enabling the plugin earlier lets it read files the index still lists
 * but a sync deleted (ENOENT, the plugin fails to load). Only the registered vault is watched by Obsidian. */
export async function waitForVaultIndex(vault = VAULT_PATH) {
	if (vault !== VAULT_PATH) return;
	const want = JSON.stringify(diskFiles(vault).sort());
	await waitFor(() => evalJs("JSON.stringify(app.vault.getFiles().map((f) => f.path).sort())") === want, 15000, 300);
}
