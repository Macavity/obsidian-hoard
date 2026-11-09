// Mirrors the versioned fixtures of one checkout into the registered test vault, keeping Obsidian's local state.
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

/** Paths inside the vault that belong to the running Obsidian, never to the fixtures (mirrors .gitignore). */
export function isLocalState(rel) {
	const p = rel.split(sep).join("/");
	const under = (dir) => p === dir || p.startsWith(`${dir}/`);
	return under(".trash") || under(".obsidian/plugins") || under(".obsidian/themes") || under(".obsidian/cache") || /^\.obsidian\/workspace[^/]*\.json$/.test(p);
}

/** Deletes everything at the top level and inside `.obsidian` of `vault` that is not local state. */
function removeStale(vault) {
	for (const rel of ["", ".obsidian"]) {
		const dir = join(vault, rel);
		if (!existsSync(dir)) continue;
		for (const name of readdirSync(dir)) {
			const entry = rel ? join(rel, name) : name;
			if (entry === ".obsidian" || isLocalState(entry)) continue;
			rmSync(join(vault, entry), { recursive: true, force: true });
		}
	}
}

/** Makes `vault` contain exactly the files of `source`, except local state. `vault` must be a `hoard-test-vault` directory; so must
 * `source` unless `requireSourceName` is false (scenario vaults). */
export function syncVault(source, vault, { requireSourceName = true } = {}) {
	for (const [dir, named] of [[source, requireSourceName], [vault, true]]) {
		if (named && basename(dir) !== "hoard-test-vault") throw new Error(`refusing to sync ${dir}: not a hoard-test-vault directory`);
		if (!existsSync(dir)) throw new Error(`${dir} does not exist`);
	}
	removeStale(vault);
	cpSync(source, vault, { recursive: true, filter: (src) => !isLocalState(relative(source, src)) });
}

/** Copies `source/.obsidian/plugins/<pluginId>/` into the vault, replacing it, although plugins are local state. No-op without one. */
export function copyPluginData(source, vault, pluginId) {
	const from = join(source, ".obsidian", "plugins", pluginId);
	if (!existsSync(from)) return;
	const to = join(vault, ".obsidian", "plugins", pluginId);
	rmSync(to, { recursive: true, force: true });
	cpSync(from, to, { recursive: true });
}
