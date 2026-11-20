// Mobile smoke for the add wizard: switches the running Obsidian to tablet emulation (`dev:mobile on`, which reloads the
// app), stubs every search (9 fixed anime results, nothing for the other kinds), opens the wizard and searches. Then
// narrows the viewport to a phone (Obsidian: below 600px) and checks the anime section shows all its cards at full height:
// only the dialog scrolls, a section never does. Saves screenshots and switches emulation off again. Obsidian must be
// running with the test vault open and the current build deployed (`pnpm vault:link-test`, `pnpm reload`).
// Output dir: $MOBILE_SMOKE_OUT or <tmp>/hoard-view--mobile.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, ensureVault, evalJs, obs, screenshot, waitFor, warnIfHidden } from "./lib/cli.mjs";

const OUT = process.env.MOBILE_SMOKE_OUT ?? join(tmpdir(), "hoard-view--mobile");
const PHONE_WIDTH = 360; // a small Android phone; iPhones start at 375
const RESULTS = 9; // one page
const MIN_PANEL_HEIGHT = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (code) => JSON.parse(evalJs(`JSON.stringify(${code})`));
const cdp = (method, params) => obs("dev:cdp", { method, params: JSON.stringify(params) });

ensureVault();
warnIfHidden();
mkdirSync(OUT, { recursive: true });

/**
 * `dev:mobile` reloads the app; until it is back, every CLI command answers "Command … not found". The add command can
 * exist before the add providers do, so wait for the index: the wizard would open without sections.
 */
function untilReady() {
	return waitFor(() => {
		try {
			return evalJs("app.plugins.plugins['hoard']?.indexReady === true ? 'ok' : 'no'") === "ok";
		} catch {
			return false;
		}
	}, 40000, 500);
}

/**
 * The wizard searches every kind at once: empties every search of the API service and gives the anime ones fixed results
 * in the AnimeSearchResult shape. The next app reload restores them.
 */
const STUB = `(() => {
	const api = app.plugins.plugins['hoard'].apiService;
	const results = Array.from({ length: ${RESULTS} }, (_, i) => ({
		malId: 900000 + i, title: 'Smoke result ' + (i + 1), episodes: 12, duration: 24, releaseDate: '2024-01-01',
		url: '', seasons: [], posterUrl: '',
	}));
	for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(api))) {
		if (name.startsWith('search')) api[name] = async () => [];
	}
	api.searchAnime = api.searchAniList = async () => results;
	return 'ok';
})()`;
const QUERY = ".hoard-add-wizard__query";
const PANEL_SELECTOR = '.hoard-add-wizard .hoard-result-sections__section[data-section="anime"] .hoard-result-sections__items';
/** Types the query and presses Enter, which skips the search debounce. */
const SEARCH = `(() => {
	const query = document.querySelector(${JSON.stringify(QUERY)});
	query.value = 'smoke';
	query.dispatchEvent(new Event('input'));
	query.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	return 'ok';
})()`;
/** Card count of the anime section once no section is loading any more; -1 until then. */
const CARDS = `(() => {
	if (document.querySelector('.hoard-add-wizard .hoard-modal__loading')) return '-1';
	return String(document.querySelectorAll(${JSON.stringify(`${PANEL_SELECTOR} .hoard-search-picker__result-card`)}).length);
})()`;
const IS_PHONE = `String(document.body.classList.contains('is-phone'))`;
const PANEL = `(() => {
	const panel = document.querySelector(${JSON.stringify(PANEL_SELECTOR)});
	const card = panel?.querySelector('.hoard-search-picker__result-card');
	if (!panel || !card) return null;
	const p = panel.getBoundingClientRect(), c = card.getBoundingClientRect();
	return {
		height: p.height,
		clipped: panel.scrollHeight - panel.clientHeight,
		cardVisible: c.top >= 0 && c.top + 40 <= window.innerHeight,
		cards: panel.querySelectorAll('.hoard-search-picker__result-card').length,
	};
})()`;

const failures = [];

/** Records a failure for each way the phone results section can fall short. */
function checkPanel(m) {
	if (!m) return failures.push("phone: anime section or card not found");
	if (m.cards !== RESULTS) failures.push(`phone: ${m.cards} result cards, expected ${RESULTS}`);
	if (m.height < MIN_PANEL_HEIGHT) failures.push(`phone: anime section ${Math.round(m.height)}px tall, expected >= ${MIN_PANEL_HEIGHT}`);
	if (m.clipped > 1) failures.push(`phone: anime section scrolls on its own (${m.clipped}px hidden), only the dialog may`);
	if (!m.cardVisible) failures.push("phone: first result card not visible on screen");
}

try {
	console.log(obs("dev:mobile", { on: true }).trim());
	await sleep(1500);
	await untilReady();
	assert(evalJs(STUB) === "ok", "search stub not installed");
	evalJs("app.commands.executeCommandById('hoard:add-title')");
	await waitFor(() => evalJs(`document.querySelector(${JSON.stringify(QUERY)}) ? 'yes' : 'no'`) === "yes", 10000);
	evalJs(SEARCH);
	await waitFor(() => evalJs(CARDS) === String(RESULTS), 10000);
	await sleep(300);
	screenshot(join(OUT, "tablet-add-wizard.png"));

	// Phone: the viewport override survives reloads, so the finally block clears it.
	cdp("Emulation.setDeviceMetricsOverride", { width: PHONE_WIDTH, height: 800, deviceScaleFactor: 2, mobile: true });
	await waitFor(() => evalJs(IS_PHONE) === "true", 5000);
	await sleep(500);
	checkPanel(json(PANEL));
	screenshot(join(OUT, "phone-add-wizard.png"));
} catch (e) {
	failures.push(`smoke aborted: ${e.message}`);
} finally {
	// Leave Obsidian as found even after a failure: modal closed, desktop mode. Problems here join `failures` instead of
	// throwing, so they never replace the failure that got us here.
	try {
		evalJs("document.querySelector('.hoard-add-wizard')?.closest('.modal')?.querySelector('.modal-close-button')?.click()");
	} catch {
		// the app may still be reloading; the reload closes the modal anyway
	}
	try {
		cdp("Emulation.clearDeviceMetricsOverride", {});
	} catch (e) {
		failures.push(`clearing the phone viewport failed: ${e.message}`);
	}
	try {
		console.log(obs("dev:mobile", { off: true }).trim());
	} catch (e) {
		failures.push(`dev:mobile off failed: ${e.message}`);
	}
	await sleep(1500);
	try {
		await untilReady();
		if (evalJs("String(app.isMobile)") !== "false") failures.push("Obsidian is still in mobile emulation");
	} catch (e) {
		failures.push(`Obsidian did not answer after dev:mobile off: ${e.message}`);
	}
}
console.log(`screenshots in ${OUT}`);
if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("mobile ok");
