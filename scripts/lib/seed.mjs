// Versioned plugin data for the test vault: both WatchLog import sources are "declined", so the onboarding wizard never opens.
import { copyFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "hoard-data.json");

/** Writes the seed to `<distDir>/data.json`, creating `distDir` and replacing any existing file. */
export function writeSeed(distDir, seedPath = SEED_PATH) {
	mkdirSync(distDir, { recursive: true });
	copyFileSync(seedPath, join(distDir, "data.json"));
}

/** The directory the running plugin loads from: the target of `<vault>/.obsidian/plugins/hoard` (a symlink into some checkout's
 * dist/, possibly another worktree's), or `fallback` when that path does not exist. */
export function pluginDataDir(vaultPath, fallback) {
	try {
		return realpathSync(join(vaultPath, ".obsidian", "plugins", "hoard"));
	} catch {
		return fallback;
	}
}
