// Step "data": the plugin loads with the current build and its index holds exactly the fixtures.
import { assert, evalJs, waitFor } from "../../lib/cli.mjs";
import { EXPECTED } from "../expected.mjs";

const P = "app.plugins.plugins['hoard']";
const READY = `(() => { const p = ${P}; return !!p && p['indexReady'] === true && !!p.dataManager && !!p.readingDataManager && !!p.gameDataManager && !!p.historyManager; })()`;
const COUNTS = `JSON.stringify((() => {
	const p = ${P};
	const root = p.getLayout().root;
	const prefix = root ? root + '/CustomLists/' : 'CustomLists/';
	return {
		id: p.manifest.id,
		importRunning: p.importRunning,
		watch: p.dataManager.getTitles().length,
		books: p.readingDataManager.getBooks().length,
		manga: p.readingDataManager.getMangaList().length,
		games: p.gameDataManager.getGames().length,
		maybe: p.dataManager.getMaybeTitles().length,
		airtime: p.dataManager.getAirtimeEntries().length,
		history: p.historyManager.getEntries().length,
		customLists: app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix) && !f.path.slice(prefix.length).includes('/')).length,
	};
})())`;

async function run(ctx) {
	await waitFor(() => evalJs(READY) === "true", 30000, 500);
	const c = JSON.parse(evalJs(COUNTS));
	assert(c.id === "hoard", "plugin manifest id");
	if (c.importRunning) {
		ctx.fail("WatchLog onboarding wizard is open — seed not applied?");
		return;
	}
	for (const [key, expected] of Object.entries(EXPECTED)) {
		if (c[key] !== expected) ctx.fail(`${key} expected ${expected}, got ${c[key]}`);
	}
}

export const dataStep = { name: "data", run };
