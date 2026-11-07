// Integration smoke against the registered test vault: the plugin must load with the current build.
// Obsidian must be running with test-vault open (`pnpm vault:link-test`, `pnpm vault:open` once).
import { assert, ensureVault, evalJs, waitFor } from "./lib/cli.mjs";

ensureVault();
await waitFor(() => evalJs("!!app.plugins.plugins['hoard']") === "true", 15000);
assert(evalJs("app.plugins.plugins['hoard'].manifest.id") === "hoard", "plugin manifest id");
console.log("smoke ok");
