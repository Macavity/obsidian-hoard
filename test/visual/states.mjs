// Catalogue of UI states for the visual-regression tool. Pure data plus setup functions: importing this file never touches
// Obsidian; the functions only talk to the running app (through scripts/lib/cli.mjs and test/e2e/ui.mjs) when called.
//
// `root` is the element that gets measured. It must survive a rename of the `hoard-*` classes, so it only uses
// `hoard-view`, Obsidian's own classes or the `data-visual-root` attribute that `markRoot` puts on the element.
// Selectors inside the setup functions may use `hoard-*` classes: they are updated together with the rename.
import { setTimeout as sleep } from "node:timers/promises";
import { evalJs, waitFor } from "../../scripts/lib/cli.mjs";
import { closeModals, waitForSelector } from "../e2e/ui.mjs";
import { SORT_INDEX_JS } from "./capture.mjs";

const VIEW = '.workspace-leaf-content[data-type="hoard-view"]';
const MARKED = "[data-visual-root]";
const TABS = ["dashboard", "watchlist", "upcoming", "reading", "games", "custom-lists", "drafts", "log"];
const PLUGIN = "app.plugins.plugins['hoard']";

const q = (v) => JSON.stringify(v);

// ---- helpers ----

/** Runs `code` in the page and fails when it answers "missing". */
function run(code, what) {
	const out = evalJs(code);
	if (out === "missing") throw new Error(`not found: ${what}`);
	return out;
}

/** Clicks the first element matching `selector` (and, if given, whose trimmed text equals `text`), via `element.click()`. */
async function clickEl(selector, text, scope = "document") {
	await waitFor(
		() =>
			evalJs(`(() => {
	const els = [...${scope}.querySelectorAll(${q(selector)})];
	const el = ${text === undefined ? "els[0]" : `els.find((e) => e.textContent.trim() === ${q(text)})`};
	if (!el) return 'missing';
	el.click();
	return 'ok';
})()`) === "ok",
		10000,
		200,
	);
	await sleep(150);
}

/** Marks the first element matching `selector` as the measured root (and unmarks any other). */
async function markRoot(selector, text) {
	await waitFor(
		() =>
			evalJs(`(() => {
	document.querySelectorAll('[data-visual-root]').forEach((e) => e.removeAttribute('data-visual-root'));
	const els = [...document.querySelectorAll(${q(selector)})];
	const el = ${text === undefined ? "els[0]" : `els.find((e) => e.textContent.trim() === ${q(text)})`};
	if (!el) return 'missing';
	el.setAttribute('data-visual-root', '');
	return 'ok';
})()`) === "ok",
		10000,
		200,
	);
}

const unmarkRoot = async () => {
	evalJs("document.querySelectorAll('[data-visual-root]').forEach((e) => e.removeAttribute('data-visual-root')); 'ok'");
};

/** Marks the topmost open modal. */
const markTopModal = () => markRoot(".modal-container:last-of-type .modal");

/** Opens the Hoard view (if needed) on a fresh instance of `tab`: the tab is left and re-entered so no earlier state leaks. */
async function openTab(tab, { watchlistView = "rows" } = {}) {
	if (evalJs("String(app.workspace.getLeavesOfType('hoard-view').length)") === "0") {
		evalJs("app.commands.executeCommandById('hoard:open-panel')");
		await waitFor(() => evalJs("String(app.workspace.getLeavesOfType('hoard-view').length)") !== "0", 10000, 200);
	}
	// a background tab is a deferred view until it is revealed
	await waitFor(
		() =>
			evalJs(`(() => {
	const leaf = app.workspace.getLeavesOfType('hoard-view')[0];
	if (!leaf) return 'false';
	void app.workspace.revealLeaf(leaf);
	if (leaf.isDeferred) void leaf.loadIfDeferred();
	app.workspace.setActiveLeaf(leaf, { focus: true });
	return String(${PLUGIN}.indexReady === true && document.querySelectorAll('.hoard-tab-bar__btn').length === ${TABS.length});
})()`) === "true",
		40000,
		300,
	);
	evalJs(`(() => {
	const leaf = app.workspace.getLeavesOfType('hoard-view')[0];
	app.workspace.revealLeaf(leaf);
	${SORT_INDEX_JS};
	${PLUGIN}.settings.defaultWatchlistView = ${q(watchlistView)};
	leaf.view.setActiveTab(${q(tab === "dashboard" ? "log" : "dashboard")});
	leaf.view.setActiveTab(${q(tab)});
	return 'ok';
})()`);
	const index = TABS.indexOf(tab);
	await waitFor(
		() => evalJs(`String(document.querySelectorAll('.hoard-tab-bar__btn')[${index}]?.classList.contains('is-active'))`) === "true",
		10000,
		200,
	);
	await waitForSelector(VIEW, 10000);
	await sleep(400);
}

const openTabs = (tab, opts) => () => openTab(tab, opts);

/** Opens a tab and then runs `after`. */
const onTab = (tab, after, opts) => async () => {
	await openTab(tab, opts);
	await after();
};

/** Clicks the card of a watchlist title and waits for its detail modal. */
async function openTitleDetail(name) {
	await openTab("watchlist");
	run(
		`(() => {
	const cell = [...document.querySelectorAll('.hoard-card__cell')].find((c) => c.querySelector('.hoard-card__under-title')?.textContent.trim() === ${q(name)});
	if (!cell) return 'missing';
	cell.querySelector('.hoard-card').click();
	return 'ok';
})()`,
		name,
	);
	await waitForSelector(".modal .hoard-detail__remove", 10000);
}

/** Clicks the card of a reading entry on the given sub tab. */
async function openReadingDetail(kind, name) {
	await openTab("reading");
	await selectReadingKind(kind);
	run(
		`(() => {
	const card = [...document.querySelectorAll('.hoard-reading-card')].find((c) => c.querySelector('.hoard-reading-card__title')?.textContent.trim() === ${q(name)});
	if (!card) return 'missing';
	card.click();
	return 'ok';
})()`,
		name,
	);
	await waitForSelector(".modal", 10000);
}

const selectReadingKind = async (kind) => {
	evalJs(`document.querySelectorAll('.hoard-reading__subtab')[${kind === "manga" ? 1 : 0}].click()`);
	await sleep(400);
};

async function openGameDetail(name) {
	await openTab("games");
	run(
		`(() => {
	const cell = [...document.querySelectorAll('.hoard-card__cell')].find((c) => c.querySelector('.hoard-card__under-title')?.textContent.trim() === ${q(name)});
	if (!cell) return 'missing';
	cell.querySelector('.hoard-card').click();
	return 'ok';
})()`,
		name,
	);
	await waitForSelector(".modal", 10000);
}

/** Opens the toolbar button with the given visible label on the current tab. */
const toolbarButton = (label) => clickEl(".hoard-view__tab-content button", label);

/** Shows Hoard's settings section. Obsidian opens its settings in a separate window that no screenshot sees, so the
 * plugin's own settings tab is hosted in a copy of the settings modal inside the main window. */
async function openSettings(section) {
	evalJs(`(() => {
	document.querySelectorAll('[data-visual-settings]').forEach((e) => e.remove());
	const tab = ${PLUGIN}.settingTab;
	const wrap = document.createElement('div');
	wrap.className = 'modal-container mod-dim';
	wrap.setAttribute('data-visual-settings', '');
	wrap.innerHTML = '<div class="modal-bg"></div><div class="modal mod-settings mod-sidebar-layout"><div class="vertical-tabs-container"><div class="vertical-tab-content-container"><div class="vertical-tab-content"></div></div></div></div>';
	document.body.appendChild(wrap);
	wrap.querySelector('.vertical-tab-content').appendChild(tab.containerEl);
	tab.display();
	return 'ok';
})()`);
	await waitForSelector(".vertical-tab-content .hoard-settings__nav-btn", 10000);
	evalJs(`document.querySelectorAll('.vertical-tab-content .hoard-settings__nav-btn')[${section}].click()`);
	await sleep(300);
}

async function closeSettings() {
	evalJs(`(() => {
	document.querySelectorAll('[data-visual-settings]').forEach((e) => e.remove());
	try { ${PLUGIN}.settingTab.hide(); } catch {}
	return 'ok';
})()`);
}

/** Replaces methods of an object in the page and remembers the originals under `window.__visualStubs[key]`. */
function stub(key, code) {
	evalJs(`(() => {
	window.__visualStubs = window.__visualStubs || {};
	if (window.__visualStubs[${q(key)}]) return 'ok';
	const saved = {};
	window.__visualStubs[${q(key)}] = saved;
	${code}
	return 'ok';
})()`);
}

function unstub(key, target) {
	evalJs(`(() => {
	const saved = (window.__visualStubs || {})[${q(key)}];
	if (!saved) return 'ok';
	for (const [name, fn] of Object.entries(saved)) ${target}[name] = fn;
	delete window.__visualStubs[${q(key)}];
	return 'ok';
})()`);
}

const stubSteam = () =>
	stub("steam", `const api = ${PLUGIN}.apiService; saved.hasSteamCredentials = api.hasSteamCredentials; api.hasSteamCredentials = () => true;`);
const unstubSteam = () => unstub("steam", `${PLUGIN}.apiService`);

const stubCollection = () =>
	stub(
		"collection",
		`const api = ${PLUGIN}.apiService;
	const dm = ${PLUGIN}.dataManager;
	saved.hasTmdbKey = api.hasTmdbKey; saved.searchTmdbMovieId = api.searchTmdbMovieId;
	saved.getTmdbMovieCollection = api.getTmdbMovieCollection; saved.getTmdbCollection = api.getTmdbCollection;
	saved.updateTmdbIdentity = dm.updateTmdbIdentity;
	api.hasTmdbKey = () => true;
	api.searchTmdbMovieId = async () => 4242;
	api.getTmdbMovieCollection = async () => ({ status: 'ok', ref: { id: 77, name: 'Visual Collection' } });
	api.getTmdbCollection = async () => ({
		id: 77, name: 'Visual Collection',
		parts: [
			{ id: 1, title: 'Blade Runner 2049', release_date: '2017-10-04', poster_path: null },
			{ id: 2, title: 'Visual Part Two', release_date: '2020-01-01', poster_path: null },
			{ id: 3, title: 'Visual Part Three', release_date: '2024-05-05', poster_path: null },
		],
	});
	dm.updateTmdbIdentity = () => {};`,
	);
/** The collection stub spans two objects; restore both explicitly. */
function restoreCollection() {
	evalJs(`(() => {
	const saved = (window.__visualStubs || {}).collection;
	if (!saved) return 'ok';
	const api = ${PLUGIN}.apiService;
	for (const n of ['hasTmdbKey', 'searchTmdbMovieId', 'getTmdbMovieCollection', 'getTmdbCollection']) api[n] = saved[n];
	${PLUGIN}.dataManager.updateTmdbIdentity = saved.updateTmdbIdentity;
	delete window.__visualStubs.collection;
	return 'ok';
})()`);
}

/** Opens the WatchLog wizard on a made-up WatchLog source; nothing is read from or written to the vault. */
const openWizard = () =>
	evalJs(`(() => {
	void ${PLUGIN}.openWizard({
		original: { kind: 'original', dir: 'visual', data: {}, counts: { titles: 12, books: 3, manga: 2, games: 4, lists: 1, notes: 5 }, pluginEnabled: false },
		fork: null,
		hoardHasData: false,
	});
	return 'ok';
})()`);

const closeWizard = async () => {
	await closeModals();
	await waitFor(() => evalJs(`String(${PLUGIN}.importRunning)`) === "false", 10000, 200);
};

const FINDER_PICK = (name) => `(() => {
	const item = [...document.querySelectorAll('.suggestion-item')].find((e) => e.textContent.trim().startsWith(${q(name)}));
	if (!item) return 'missing';
	item.click();
	return 'ok';
})()`;

async function openScheduleFor(name) {
	await openTab("upcoming");
	await clickEl(".hoard-view__tab-content .hoard-toolbar__add-btn");
	await waitForSelector(".prompt .suggestion-item", 10000);
	await waitFor(() => run(FINDER_PICK(name), name) === "ok", 10000, 300);
	await waitForSelector(".modal", 10000);
}

/** Opens a title's detail modal in the list view and the accordion of one title. */
async function expandListRow(name) {
	evalJs(`(() => {
	const row = [...document.querySelectorAll('.hoard-list__virtual-item, .hoard-accordion')].find((r) => r.textContent.includes(${q(name)}));
	if (!row) return 'missing';
	(row.querySelector('.hoard-accordion__header') ?? row.querySelector('.hoard-list__column-title') ?? row).click();
	return 'ok';
})()`);
	await sleep(400);
}

// ---- catalogue ----

/** @type {{ id: string, root: string, setup: () => Promise<void>, teardown?: () => Promise<void>, phone?: boolean, foreground?: boolean }[]} */
export const STATES = [
	// tabs
	{ id: "tab-dashboard", root: VIEW, setup: openTabs("dashboard"), phone: true },
	{ id: "tab-watchlist", root: VIEW, setup: openTabs("watchlist"), phone: true },
	{ id: "tab-upcoming", root: VIEW, setup: openTabs("upcoming"), phone: true },
	{ id: "tab-reading-books", root: VIEW, setup: onTab("reading", () => selectReadingKind("books")), phone: true },
	{ id: "tab-reading-manga", root: VIEW, setup: onTab("reading", () => selectReadingKind("manga")), phone: true },
	{ id: "tab-games", root: VIEW, setup: openTabs("games"), phone: true },
	{ id: "tab-custom-lists", root: VIEW, setup: openTabs("custom-lists"), phone: true },
	{ id: "tab-drafts", root: VIEW, setup: openTabs("drafts"), phone: true },
	{ id: "tab-log", root: VIEW, setup: openTabs("log"), phone: true },
	{
		id: "upcoming-tracker-cards",
		root: VIEW,
		setup: async () => {
			evalJs(`${PLUGIN}.settings.upcomingTrackerView = 'cards'`);
			await openTab("upcoming");
		},
		teardown: async () => {
			evalJs(`${PLUGIN}.settings.upcomingTrackerView = 'list'`);
		},
	},
	{ id: "upcoming-history", root: VIEW, setup: onTab("upcoming", () => clickEl(".hoard-inner-tabs__btn", "Verlauf")) },
	{ id: "upcoming-maybe", root: VIEW, setup: onTab("upcoming", () => clickEl(".hoard-inner-tabs__btn", "Vielleicht")) },
	{
		id: "watchlist-list",
		root: VIEW,
		setup: openTabs("watchlist", { watchlistView: "list" }),
		teardown: async () => {
			evalJs(`${PLUGIN}.settings.defaultWatchlistView = 'rows'`);
		},
	},
	{
		id: "watchlist-list-expanded",
		root: VIEW,
		setup: async () => {
			await openTab("watchlist", { watchlistView: "list" });
			await expandListRow("Severance");
		},
		teardown: async () => {
			evalJs(`${PLUGIN}.settings.defaultWatchlistView = 'rows'`);
		},
	},
	{
		id: "watchlist-selection",
		root: VIEW,
		setup: async () => {
			await openTab("watchlist", { watchlistView: "list" });
			await toolbarButton("Auswählen");
			await sleep(300);
			await clickEl(".hoard-list__column-select input, .hoard-list__column-select");
			await sleep(300);
		},
		teardown: async () => {
			evalJs(`${PLUGIN}.settings.defaultWatchlistView = 'rows'`);
		},
	},
	{
		id: "custom-list-table",
		root: VIEW,
		setup: async () => {
			await openTab("custom-lists");
			await waitForSelector(".hoard-custom-list-table__row-action--add", 10000);
		},
	},

	// detail modals
	{ id: "modal-title-series", root: ".modal", setup: () => openTitleDetail("Severance"), phone: true },
	{ id: "modal-title-movie", root: ".modal", setup: () => openTitleDetail("Blade Runner 2049") },
	{ id: "modal-reading-book", root: ".modal", setup: () => openReadingDetail("books", "Dune"), phone: true },
	{ id: "modal-reading-manga", root: ".modal", setup: () => openReadingDetail("manga", "Berserk") },
	{ id: "modal-game-detail", root: ".modal", setup: () => openGameDetail("Hades"), phone: true },
	{
		id: "modal-collection",
		root: MARKED,
		setup: async () => {
			stubCollection();
			await openTitleDetail("Blade Runner 2049");
			await clickEl(".modal .hoard-detail__collection-btn");
			await waitFor(() => evalJs("String(document.querySelectorAll('.modal-container').length)") === "2", 10000, 200);
			await markTopModal();
		},
		teardown: async () => {
			await unmarkRoot();
			restoreCollection();
		},
	},

	// add modals
	{
		id: "modal-add-title-choice",
		root: ".modal",
		setup: async () => {
			await openTab("watchlist");
			await clickEl(".hoard-view__tab-content .hoard-toolbar__add-btn");
			await waitForSelector(".modal .hoard-draft-choice__btn", 10000);
		},
	},
	{
		id: "modal-add-title",
		root: ".modal",
		setup: async () => {
			evalJs("app.commands.executeCommandById('hoard:add-title')");
			await waitForSelector(".modal .hoard-search-picker__query, .modal input", 10000);
		},
		phone: true,
	},
	{
		id: "modal-add-from-url",
		root: ".modal",
		setup: async () => {
			await openTab("watchlist");
			await clickEl(".hoard-view__tab-content .hoard-toolbar__add-btn");
			await clickEl(".modal .hoard-draft-choice__btn", "Aus URL hinzufügen");
			await waitForSelector(".modal input", 10000);
		},
	},
	{
		id: "modal-add-reading",
		root: ".modal",
		setup: async () => {
			await openTab("reading");
			await clickEl(".hoard-reading-modal__add-btn");
			await waitForSelector(".modal input", 10000);
		},
	},
	{
		id: "modal-add-game",
		root: ".modal",
		setup: async () => {
			await openTab("games");
			await clickEl(".hoard-view__tab-content .hoard-toolbar__add-btn");
			await waitForSelector(".modal input", 10000);
		},
	},
	{
		id: "modal-add-credit",
		root: MARKED,
		setup: async () => {
			await openTitleDetail("Severance");
			await clickEl(".modal .hoard-credits__add");
			await waitFor(() => evalJs("String(document.querySelectorAll('.modal-container').length)") === "2", 10000, 200);
			await markTopModal();
		},
		teardown: unmarkRoot,
	},

	// data modals
	{
		id: "modal-csv-export",
		root: MARKED,
		setup: async () => {
			await openSettings(3);
			await clickEl(".vertical-tab-content .hoard-settings__body button", "CSV exportieren");
			await waitFor(() => evalJs("String(document.querySelectorAll('.modal-container').length)") === "2", 10000, 200);
			await markTopModal();
			// the list follows the order the notes were indexed in, which varies; sort it by title
			evalJs(`(() => {
	const list = document.querySelector('[data-visual-root] .hoard-csv__list');
	[...list.children].sort((a, b) => a.textContent.localeCompare(b.textContent)).forEach((row) => list.appendChild(row));
	return 'ok';
})()`);
		},
		teardown: async () => {
			await unmarkRoot();
			await closeSettings();
		},
	},
	{
		id: "modal-csv-import",
		root: MARKED,
		setup: async () => {
			await openSettings(3);
			await clickEl(".vertical-tab-content .hoard-settings__body button", "CSV importieren");
			await waitFor(() => evalJs("String(document.querySelectorAll('.modal-container').length)") === "2", 10000, 200);
			await markTopModal();
		},
		teardown: async () => {
			await unmarkRoot();
			await closeSettings();
		},
	},
	{
		id: "modal-steam-sync",
		root: MARKED,
		setup: async () => {
			stubSteam();
			await openSettings(1);
			await clickEl(".vertical-tab-content .hoard-api-provider__action-btn");
			await waitFor(() => evalJs("String(document.querySelectorAll('.modal-container').length)") === "2", 10000, 200);
			await markTopModal();
		},
		teardown: async () => {
			await unmarkRoot();
			await closeSettings();
			unstubSteam();
		},
	},
	{
		id: "modal-watchlog-onboarding",
		root: ".modal",
		setup: async () => {
			openWizard();
			await waitForSelector(".modal", 10000);
		},
		teardown: closeWizard,
	},
	{
		id: "modal-custom-list-columns",
		root: ".modal",
		setup: async () => {
			await openTab("custom-lists");
			await toolbarButton("Tabelleneinstellungen");
			await waitForSelector(".modal", 10000);
		},
	},
	{
		id: "modal-reading-columns",
		root: ".modal",
		setup: async () => {
			await openTab("reading");
			await clickEl(".hoard-reading__manage-btn");
			await waitForSelector(".modal", 10000);
		},
	},
	{
		id: "modal-rows-customize",
		root: ".modal",
		setup: async () => {
			await openTab("watchlist");
			await clickEl(".hoard-rows-customize__btn");
			await waitForSelector(".modal", 10000);
		},
	},
	{ id: "modal-schedule-reading", root: ".modal", setup: () => openScheduleFor("Dune") },
	{ id: "modal-schedule-game", root: ".modal", setup: () => openScheduleFor("Hades") },
	{
		id: "modal-search-help",
		root: ".modal",
		setup: async () => {
			await openTab("watchlist");
			await clickEl(".hoard-search-help__btn");
			await waitForSelector(".modal", 10000);
		},
	},
	{
		id: "modal-confirm",
		root: ".modal",
		setup: async () => {
			await openTab("custom-lists");
			await clickEl(".hoard-custom-lists__subtab-delete");
			await waitForSelector(".modal", 10000);
		},
	},
	{
		id: "modal-notes-editor",
		root: ".modal",
		setup: async () => {
			await openTab("custom-lists");
			await toolbarButton("Notizen");
			await waitForSelector(".modal", 10000);
		},
	},
	{
		id: "modal-upcoming-finder",
		root: ".prompt",
		setup: async () => {
			await openTab("upcoming");
			await clickEl(".hoard-view__tab-content .hoard-toolbar__add-btn");
			await waitForSelector(".prompt .suggestion-item", 10000);
		},
	},

	// settings
	...["general", "api", "customize", "watchlist", "drafts", "custom-lists", "reading", "widgets", "quick-info"].map((name, i) => ({
		id: `settings-${name}`,
		root: ".vertical-tab-content",
		setup: () => openSettings(i),
		teardown: closeSettings,
	})),

	// popovers
	{
		id: "popover-filter",
		root: MARKED,
		setup: async () => {
			await openTab("watchlist");
			await toolbarButton("Filter ▼");
			await markRoot(".hoard-filter-panel");
		},
		teardown: async () => {
			await unmarkRoot();
			evalJs("document.querySelectorAll('.hoard-filter-panel--popup').forEach((e) => e.remove()); 'ok'");
		},
	},
	{
		id: "popover-sorting",
		root: VIEW,
		setup: async () => {
			await openTab("watchlist");
			await toolbarButton("Sortierung ▼");
			await waitForSelector(".hoard-sort-panel", 10000);
		},
	},
	{
		id: "popover-view-switch",
		root: VIEW,
		setup: async () => {
			await openTab("watchlist");
			await clickEl(".hoard-view-switch__btn");
			await waitForSelector(".hoard-view-switch__panel", 10000);
		},
	},
	{
		id: "popover-color-picker",
		root: MARKED,
		setup: async () => {
			await openTab("custom-lists");
			await toolbarButton("Tabelleneinstellungen");
			await waitForSelector(".modal .hoard-edit-columns__tab-color-dot", 10000);
			await clickEl(".modal .hoard-edit-columns__tab-color-dot");
			await markRoot(".hoard-color-picker__palette");
		},
		teardown: unmarkRoot,
	},
	{
		id: "popover-date-picker",
		root: MARKED,
		setup: async () => {
			await openTitleDetail("Severance");
			evalJs("document.querySelector('.modal .hoard-date-picker__input').dispatchEvent(new MouseEvent('click', { bubbles: true })); document.querySelector('.modal .hoard-date-picker__input').focus(); 'ok'");
			await markRoot(".hoard-date-picker__panel");
		},
		teardown: unmarkRoot,
	},
	{
		id: "popover-status-dropdown",
		root: MARKED,
		setup: async () => {
			await openReadingDetail("books", "Dune");
			await clickEl(".modal .hoard-reading-detail__status");
			await markRoot(".hoard-status-dropdown");
		},
		teardown: unmarkRoot,
	},

	// widgets note
	{
		id: "note-widgets",
		root: ".markdown-reading-view",
		// the reading view renders nothing while the window is in the background
		foreground: true,
		setup: async () => {
			// opening is asynchronous and the CLI does not wait for it: ask again until the widgets are on screen
			await waitFor(
				() =>
					evalJs(`(() => {
	if (document.querySelector('.markdown-reading-view .hoard-widget')) return 'true';
	const leaves = app.workspace.getLeavesOfType('markdown');
	if (leaves.length === 0) {
		const file = app.vault.getFileByPath('Visual widgets.md');
		if (!file) return 'false';
		void app.workspace.getLeaf('tab').openFile(file, { state: { mode: 'preview' } });
	} else {
		// open but not rendered: a background tab renders nothing
		app.workspace.setActiveLeaf(leaves[0], { focus: true });
	}
	return 'false';
})()`) === "true",
				20000,
				1000,
			);
		},
		teardown: async () => {
			evalJs("app.workspace.getLeavesOfType('markdown').forEach((l) => l.detach()); 'ok'");
		},
	},
];
