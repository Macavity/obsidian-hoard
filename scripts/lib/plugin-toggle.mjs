// Runs `fn` with the hoard plugin disabled in a running test vault: the plugin's onunload flushes its LocalStore and would write
// stale data.json content back over files `fn` just replaced. Without a reachable vault, `fn` just runs. `fn` receives `live`: true
// when Obsidian is running the vault (so it can wait for the vault index before the plugin comes back).
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
	if (!hoardEnabled()) return fn(false);
	// Everything after the first evalJs sits in the try: a later reset sees a disabled plugin as "not live" and never re-enables it.
	try {
		evalJs("app.plugins.disablePlugin('hoard')");
		// modals of the unloaded instance (e.g. the onboarding wizard, which has no close button) outlive the unload. Removing them
		// from the DOM instead of pressing a button keeps the dead instance from acting on a click; a reset leaves none open.
		evalJs("document.querySelectorAll('.modal-container').forEach((m) => m.remove())");
		await fn(true);
	} finally {
		evalJs("app.plugins.enablePlugin('hoard')");
	}
}
