// Scenario runner: swaps the registered test vault's content and WatchLog plugin data for an isolated scenario, then restores them.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO, VAULT_PATH } from "../lib/cli.mjs";
import { withPluginDisabled } from "../lib/plugin-toggle.mjs";
import { pluginDataDir, writeSeed } from "../lib/seed.mjs";
import { waitForVaultIndex } from "../lib/vault-index.mjs";
import { copyPluginData, syncVault } from "../lib/vault-sync.mjs";

const SCENARIOS = join(REPO, "scripts", "e2e", "scenarios");
/** Hoard's empty local data (`emptyData()` in src/storage/LocalStore.ts; test/scenario.test.ts keeps them equal). */
export const EMPTY_DATA = { schemaVersion: 2, settings: {}, cache: {}, ui: {} };

/** The WatchLog data could not be put back; the message names the backup folder. Callers must stop running scenarios: the next
 * one would back up this scenario's data as the user's. */
export class RestoreError extends Error {}

const message = (e) => (e instanceof Error ? e.message : String(e));

export function scenarioDir(name) {
	const dir = join(SCENARIOS, name);
	if (!/^[\w-]+$/.test(name) || !existsSync(join(dir, "vault"))) throw new Error(`unknown scenario: ${name}`);
	return dir;
}

function runVaultReset() {
	execFileSync("pnpm", ["vault:reset"], { cwd: REPO, stdio: "inherit" });
}

const watchlogDir = (vault) => join(vault, ".obsidian", "plugins", "watchlog");

/** Installs scenario `name` into `vault`. The returned `restore()` is only handed out once the user's WatchLog data is backed up;
 * if prepare throws, nothing has been replaced yet except possibly the backup-then-delete step, so callers use
 * `const s = await prepareScenario(...)` before `try { ... } finally { await s.restore() }`. Prepare itself restores on failure. */
export async function prepareScenario(name, { vault = VAULT_PATH, distDir = pluginDataDir(VAULT_PATH, join(REPO, "dist")), resetVault = runVaultReset } = {}) {
	const dir = scenarioDir(name);
	const backupRoot = mkdtempSync(join(tmpdir(), "hoard-scenario-"));
	const backup = join(backupRoot, "watchlog");
	const hadWatchlog = existsSync(watchlogDir(vault));
	if (hadWatchlog) cpSync(watchlogDir(vault), backup, { recursive: true });

	const restore = async () => {
		try {
			await withPluginDisabled(() => {
				rmSync(watchlogDir(vault), { recursive: true, force: true });
				if (hadWatchlog) cpSync(backup, watchlogDir(vault), { recursive: true });
			});
		} catch (e) {
			throw new RestoreError(`restoring WatchLog data failed, backup kept in ${backupRoot}: ${message(e)}`);
		}
		rmSync(backupRoot, { recursive: true, force: true });
		await resetVault();
	};

	try {
		await withPluginDisabled(async (live) => {
			rmSync(watchlogDir(vault), { recursive: true, force: true });
			syncVault(join(dir, "vault"), vault, { requireSourceName: false });
			copyPluginData(join(dir, "vault"), vault, "watchlog");
			if (live) await waitForVaultIndex(vault);
			const custom = join(dir, "data.json");
			if (existsSync(custom)) return writeSeed(distDir, custom);
			const tmp = join(backupRoot, "empty-data.json");
			writeFileSync(tmp, JSON.stringify(EMPTY_DATA));
			writeSeed(distDir, tmp);
		});
	} catch (err) {
		try {
			await restore();
		} catch (e) {
			throw new RestoreError(`${message(err)}; then ${message(e)}`);
		}
		throw err;
	}
	return { restore };
}
