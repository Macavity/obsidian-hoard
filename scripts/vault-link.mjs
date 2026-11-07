// Installs the build output dist/ into a vault's .obsidian/plugins/hoard. Idempotent.
// Usage:
//   node scripts/vault-link.mjs --test            -> the registered hoard-test-vault, symlinked to this checkout (pnpm vault:link-test)
//   node scripts/vault-link.mjs [vault-name]      -> a vault registered in Obsidian, gets a copy of dist/ (Obsidian Sync skips symlinks);
//                                                    without a name, pick from a list
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { REPO, VAULT_PATH, listVaults } from "./lib/cli.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const wanted = args.find((a) => !a.startsWith("--"));
const DIST = join(REPO, "dist");

/** The registered vault called `name`; throws on several hits, null when none. */
function findByName(vaults, name) {
	const hits = vaults.filter((v) => v.name === name);
	if (hits.length > 1) throw new Error(`Several vaults are named "${name}":\n` + hits.map((v) => `  ${v.path}`).join("\n"));
	return hits[0] ?? null;
}

/** Interactive choice from a numbered list; throws when not on a TTY or aborted. */
async function askVault(vaults) {
	if (!process.stdin.isTTY) throw new Error("Pass a vault name: pnpm vault:link <name>");
	console.log("Registered vaults:");
	vaults.forEach((v, i) => console.log(`  ${String(i + 1).padStart(2)}  ${v.name}\t${v.path}`));
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = (await rl.question("Link plugin into vault # (empty to abort): ")).trim();
		const idx = Number(answer);
		if (!answer || !Number.isInteger(idx) || idx < 1 || idx > vaults.length) throw new Error("aborted");
		return vaults[idx - 1];
	} finally {
		rl.close();
	}
}

async function pickVault() {
	const vaults = listVaults().filter((v) => resolve(v.path) !== resolve(VAULT_PATH));
	if (vaults.length === 0) throw new Error("No vaults registered in Obsidian (besides hoard-test-vault).");
	if (wanted) {
		const hit = findByName(vaults, wanted);
		if (hit) return hit;
		console.error(`No registered vault named "${wanted}".`);
	}
	return askVault(vaults);
}

/** Copies dist/ into `target`, replacing an old symlink so the copy never lands in dist/ itself. Keeps data.json. */
function copyInstall(target, label) {
	if (!existsSync(join(DIST, "main.js"))) throw new Error("dist/main.js missing, run pnpm build first.");
	if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
		console.log(`replacing symlink ${target} (was ${readlinkSync(target)})`);
		unlinkSync(target);
	}
	mkdirSync(target, { recursive: true });
	for (const f of readdirSync(DIST)) cpSync(join(DIST, f), join(target, f), { recursive: true });
	console.log(`copied dist/ to ${target}`);
	console.log(`Enable "Hoard" under Settings → Community plugins in "${label}" (or: obsidian vault="${label}" plugin:enable id=hoard).`);
}

/** True when `target` already links to this checkout's dist/. A link elsewhere (another worktree) is replaced; anything else throws. */
function linkExists(target) {
	let st = null;
	try {
		st = lstatSync(target);
	} catch {}
	if (!st) return false;
	if (!st.isSymbolicLink()) throw new Error(`${target} exists and is not a symlink; remove it manually.`);
	let real = null;
	try {
		real = realpathSync(target);
	} catch {}
	if (real === realpathSync(DIST)) return true;
	console.log(`re-linking ${target} (was ${readlinkSync(target)})`);
	unlinkSync(target);
	return false;
}

function linkInstall(pluginsDir, target) {
	mkdirSync(DIST, { recursive: true });
	if (linkExists(target)) {
		console.log(`link ok: ${target} -> ${readlinkSync(target)}`);
		return;
	}
	if (process.platform === "win32") symlinkSync(resolve(DIST), target, "junction");
	else symlinkSync(relative(pluginsDir, resolve(DIST)), target);
	console.log(`linked ${target} -> ${readlinkSync(target)}`);
}

function install(vaultPath, label) {
	const pluginsDir = join(vaultPath, ".obsidian", "plugins");
	const target = join(pluginsDir, "hoard");
	mkdirSync(pluginsDir, { recursive: true });
	if (label) copyInstall(target, label);
	else linkInstall(pluginsDir, target);
}

try {
	if (flags.has("--test")) install(VAULT_PATH, null);
	else {
		const v = await pickVault();
		install(v.path, v.name);
	}
} catch (e) {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
}
