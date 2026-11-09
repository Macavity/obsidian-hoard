// Runs `fn` with the hoard plugin disabled in a running test vault: the plugin's onunload flushes its LocalStore and would write
// stale data.json content back over files `fn` just replaced. Without a reachable vault, `fn` just runs.
import { ensureVault, evalJs } from "./cli.mjs";

/** True when Obsidian is running, the test vault is registered correctly and the hoard plugin is enabled. */
function hoardEnabled() {
	try {
		ensureVault();
		return evalJs("String(app.plugins.enabledPlugins.has('hoard'))") === "true";
	} catch {
		return false; // Obsidian not running or vault not registered
	}
}

export async function withPluginDisabled(fn) {
	if (!hoardEnabled()) return fn();
	evalJs("app.plugins.disablePlugin('hoard')");
	try {
		await fn();
	} finally {
		evalJs("app.plugins.enablePlugin('hoard')");
	}
}
