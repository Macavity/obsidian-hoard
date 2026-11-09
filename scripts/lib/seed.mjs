// Versioned plugin data for the test vault: both WatchLog import sources are "declined", so the onboarding wizard never opens.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "hoard-data.json");

/** Writes the seed to `<distDir>/data.json`, creating `distDir` and replacing any existing file. */
export function writeSeed(distDir, seedPath = SEED_PATH) {
	mkdirSync(distDir, { recursive: true });
	copyFileSync(seedPath, join(distDir, "data.json"));
}
