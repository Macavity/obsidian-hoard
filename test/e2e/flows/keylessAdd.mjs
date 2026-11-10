// Flows: a fresh install without API keys finds, fills and adds a movie, a show, a book and a game through the real add
// modals (Cinemeta, Open Library, Steam Store). Each note on disk must carry the source's External ID and a cover.
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, type, waitForSelector } from "../ui.mjs";
import { findNoteByExternalId } from "../note.mjs";
import { chooseOption, runCommand } from "./common.mjs";

const TYPE_SELECT = ".hoard-add-modal > .hoard-modal-row:first-child select";
const PICK_ATTR = "data-smoke-pick";
const PICKED = `[${PICK_ATTR}]`;
const DUPLICATE_CONTINUE = ".hoard-duplicate-warning .hoard-btn-primary";

/** The search results are network answers: wait for the card, mark it, and click it like a user would. */
async function pickResult({ title, metaIncludes = "" }) {
	const find = `(() => {
	const cards = [...document.querySelectorAll('.hoard-modal-results .hoard-result-card')];
	const hit = cards.find((c) => c.querySelector('.hoard-result-title')?.textContent === ${JSON.stringify(title)} && (c.querySelector('.hoard-result-meta')?.textContent ?? '').includes(${JSON.stringify(metaIncludes)}));
	if (!hit) return "false";
	hit.setAttribute(${JSON.stringify(PICK_ATTR)}, "1");
	return "true";
})()`;
	await waitFor(() => evalJs(find) === "true", 30000, 500);
	await click(PICKED);
}

/** Waits until a text input of the form holds the (prefilled) title: the pick is resolved and applied. */
async function waitForFilledTitle(formSelector, title) {
	const filled = `String([...document.querySelectorAll(${JSON.stringify(`${formSelector} input`)})].some((i) => i.value.includes(${JSON.stringify(title)})))`;
	await waitFor(() => evalJs(filled) === "true", 30000, 500);
}

/** Clicks the submit button; a name-based duplicate warning (a fixture with the same title) is confirmed like a user would. */
async function submit(selector, notePresent) {
	await click(selector);
	const outcome = await waitFor(() => (notePresent() ? "saved" : evalJs(`String(!!document.querySelector(${JSON.stringify(DUPLICATE_CONTINUE)}))`) === "true" ? "duplicate" : ""), 15000);
	if (outcome === "duplicate") await click(DUPLICATE_CONTINUE);
}

async function assertNote(dir, externalId) {
	const note = await waitFor(() => findNoteByExternalId(VAULT_PATH, dir, externalId), 15000);
	const cover = note.props.Cover;
	assert(typeof cover === "string" && cover !== "" && cover !== "none", `${note.path}: Cover is ${JSON.stringify(cover)}`);
	return note;
}

async function addTitle({ kind, query, title, metaIncludes, externalId }) {
	runCommand("hoard:add-title");
	await waitForSelector(".hoard-add-modal .hoard-search-query");
	await chooseOption(TYPE_SELECT, kind);
	await click(".hoard-add-modal .hoard-search-query");
	await type(query);
	await pickResult({ title, metaIncludes });
	await waitForFilledTitle(".hoard-modal-form", title);
	const found = () => findNoteByExternalId(VAULT_PATH, `Hoard/${kind}`, externalId) !== null;
	await submit(".hoard-modal-form .hoard-modal-btn-row .hoard-btn-primary", found);
	return assertNote(`Hoard/${kind}`, externalId);
}

async function openTabAdd(tabIndex, addSelector) {
	runCommand("hoard:open-panel");
	await waitForSelector(".hoard-tab-btn");
	await click(`.hoard-tab-btn:nth-child(${tabIndex})`);
	await waitForSelector(addSelector);
	await click(addSelector);
}

async function addBook({ query, title, metaIncludes, externalId }) {
	await openTabAdd(4, ".hoard-tab-content .hoard-reading-add-btn");
	await waitForSelector(".hoard-reading-lookup-input");
	await click(".hoard-reading-lookup-input");
	await type(query);
	await pickResult({ title, metaIncludes });
	await waitForFilledTitle(".hoard-reading-form-wrap", title);
	const found = () => findNoteByExternalId(VAULT_PATH, "Hoard/Books", externalId) !== null;
	await submit(".hoard-reading-modal-save", found);
	return assertNote("Hoard/Books", externalId);
}

async function addGame({ query, title, externalId }) {
	await openTabAdd(5, ".hoard-tab-content .hoard-add-btn");
	await waitForSelector(".hoard-add-game-modal input.hoard-modal-input");
	await click(".hoard-add-game-modal input.hoard-modal-input");
	await type(query);
	await pickResult({ title });
	await waitForFilledTitle(".hoard-modal-form", title);
	const found = () => findNoteByExternalId(VAULT_PATH, "Hoard/Games", externalId) !== null;
	await submit(".hoard-modal-form .hoard-modal-btn-row .hoard-btn-primary", found);
	return assertNote("Hoard/Games", externalId);
}

export const KEYLESS_CASES = [
	["movie", () => addTitle({ kind: "Movie", query: "The Matrix", title: "The Matrix", externalId: "imdb:tt0133093" })],
	["show", () => addTitle({ kind: "TV Show", query: "Breaking Bad", title: "Breaking Bad", externalId: "imdb:tt0903747" })],
	["book", () => addBook({ query: "The Hobbit", title: "The Hobbit", metaIncludes: "Tolkien", externalId: /^openlibrary:OL\d+W$/ })],
	["game", () => addGame({ query: "Hades", title: "Hades", externalId: "steam:1145360" })],
];
