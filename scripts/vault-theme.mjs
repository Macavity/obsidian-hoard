// Switches the test vault's theme for theme-compatibility checks: `pnpm vault:theme Cupertino`, `pnpm vault:theme default`.
// Themes from scripts/themes.json are downloaded on demand into the vault (gitignored); the choice is Obsidian state.
import { ensureVault } from "./lib/cli.mjs";
import { activateTheme, ensureTheme, THEMES } from "./lib/themes.mjs";

ensureVault();
const wanted = process.argv[2] ?? "";
const theme = wanted === "" || wanted === "default" ? "" : wanted;
const active = theme ? await ensureTheme(theme) : "";
await activateTheme(active);
console.log(`theme: ${active || "default"} (known: ${Object.keys(THEMES).join(", ")})`);
