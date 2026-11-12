// Reloads the hoard plugin in the running test vault. Obsidian reads the plugin folders when the app starts, so a plugin
// linked after that is unknown to it ("Plugin not found"); then the whole app is reloaded, which also loads the plugin.
import { ensureVault, evalJs, obs, waitFor } from "./lib/cli.mjs";

const KNOWN = "String('hoard' in app.plugins.manifests)";
const LOADED = "String(app.workspace.layoutReady && app.plugins.plugins['hoard']?.indexReady === true)";

/** False while the app is still reloading: until it is back, every CLI command answers "Command … not found". */
function loaded() {
	try {
		return evalJs(LOADED) === "true";
	} catch {
		return false;
	}
}

ensureVault();
if (evalJs(KNOWN) === "true") console.log(obs("plugin:reload", { id: "hoard" }).trim());
else {
	console.log("hoard is not known to the running Obsidian (linked after it started): reloading the app");
	obs("reload");
	try {
		await waitFor(loaded, 30000, 500);
	} catch {
		throw new Error("hoard did not load after the app reload. Turn off Restricted mode and enable hoard in the test vault (CONTRIBUTING.md, test vault setup).");
	}
	console.log("Reloaded: Obsidian, with hoard");
}
