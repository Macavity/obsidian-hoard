// Third-party themes for compatibility checks. They are downloaded on demand into the registered vault
// (test-vault/.obsidian/themes/, gitignored) and never versioned; scripts/themes.json maps a label → GitHub repo.
// Obsidian only registers a theme whose folder is named exactly like `name` in its manifest, so the folder is derived
// from the downloaded manifest, not from the label.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evalJs, VAULT_PATH, waitFor } from "./cli.mjs";

export const THEMES = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "themes.json"), "utf8"));
export const THEMES_DIR = join(VAULT_PATH, ".obsidian", "themes");

async function fetchText(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

/** Installs the theme behind `label` (a key of themes.json) unless present. Returns the theme's manifest name. */
export async function ensureTheme(label) {
	const repo = THEMES[label];
	if (!repo) throw new Error(`unknown theme "${label}"; known: ${Object.keys(THEMES).join(", ")}`);
	const raw = `https://raw.githubusercontent.com/${repo}/HEAD`;
	const manifest = await fetchText(`${raw}/manifest.json`);
	const name = JSON.parse(manifest).name;
	const dir = join(THEMES_DIR, name);
	if (existsSync(join(dir, "theme.css"))) return name;
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "manifest.json"), manifest);
	writeFileSync(join(dir, "theme.css"), await fetchText(`${raw}/theme.css`));
	console.log(`downloaded ${name} from ${repo}`);
	return name;
}

/** Activates a theme by manifest name ("" = default) in the running Obsidian. A freshly downloaded folder shows up in
 * Obsidian's file index with a delay, so the themes folder is rescanned until the theme is registered. */
export async function activateTheme(name) {
	if (name) {
		await waitFor(() => evalJs(`(async () => { await app.customCss.readThemes(); return !!app.customCss.themes[${JSON.stringify(name)}]; })()`) === "true", 15000, 500);
	}
	// Obsidian re-applies appearance.json when its debounced write lands, which can undo a quick switch: verify and retry.
	for (let attempt = 0; attempt < 5; attempt++) {
		evalJs(`app.customCss.setTheme(${JSON.stringify(name)})`);
		await new Promise((r) => setTimeout(r, 1000));
		if (evalJs("app.customCss.theme") === name) return;
	}
	throw new Error(`theme "${name || "default"}" did not stay active`);
}
