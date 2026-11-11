// Flows: a fresh install without API keys finds, fills and adds a movie, a show, a book and a game through the real add
// modals (Cinemeta, Open Library, Steam Store). Each note on disk must carry the source's External ID and a cover.
import { evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, type, waitForSelector } from "../ui.mjs";
import { findNoteByExternalId } from "../note.mjs";
import { chooseOption, runCommand } from "./common.mjs";

const TYPE_SELECT = ".hoard-add-modal > .hoard-modal__row:first-child select";
const PICK_ATTR = "data-smoke-pick";
const PICKED = `[${PICK_ATTR}]`;
const DUPLICATE_CONTINUE = ".hoard-modal__duplicate-warning .hoard-btn--primary";

/** The search results are network answers: wait for the card, mark it, and click it like a user would. */
async function pickResult({ title, metaIncludes = "" }) {
	const find = `(() => {
	const cards = [...document.querySelectorAll('.hoard-modal__results .hoard-search-picker__result-card')];
	const hit = cards.find((c) => c.querySelector('.hoard-search-picker__result-title')?.textContent === ${JSON.stringify(title)} && (c.querySelector('.hoard-search-picker__result-meta')?.textContent ?? '').includes(${JSON.stringify(metaIncludes)}));
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

/** The cover arrives after the note is saved (poster queue, cover fetch), so wait for it instead of reading once. */
function hasCover(note) {
	const cover = note?.props.Cover;
	return typeof cover === "string" && cover !== "" && cover !== "none";
}

function assertNote(dir, externalId) {
	return waitFor(() => {
		const found = findNoteByExternalId(VAULT_PATH, dir, externalId);
		return hasCover(found) ? found : null;
	}, 15000);
}

async function addTitle({ kind, query, title, metaIncludes, externalId }) {
	runCommand("hoard:add-title");
	await waitForSelector(".hoard-add-modal .hoard-search-picker__query");
	await chooseOption(TYPE_SELECT, kind);
	await click(".hoard-add-modal .hoard-search-picker__query");
	await type(query);
	await pickResult({ title, metaIncludes });
	await waitForFilledTitle(".hoard-modal__form", title);
	const found = () => findNoteByExternalId(VAULT_PATH, `Hoard/${kind}`, externalId) !== null;
	await submit(".hoard-modal__form .hoard-modal__btn-row .hoard-btn--primary", found);
	return assertNote(`Hoard/${kind}`, externalId);
}

async function openTabAdd(tabIndex, addSelector) {
	runCommand("hoard:open-panel");
	await waitForSelector(".hoard-tab-bar__btn");
	await click(`.hoard-tab-bar__btn:nth-child(${tabIndex})`);
	await waitForSelector(addSelector);
	await click(addSelector);
}

async function addBook({ query, title, metaIncludes, externalId }) {
	await openTabAdd(4, ".hoard-view__tab-content .hoard-reading-modal__add-btn");
	await waitForSelector(".hoard-reading-form__lookup-input");
	await click(".hoard-reading-form__lookup-input");
	await type(query);
	await pickResult({ title, metaIncludes });
	await waitForFilledTitle(".hoard-reading-form__wrap", title);
	const found = () => findNoteByExternalId(VAULT_PATH, "Hoard/Books", externalId) !== null;
	await submit(".hoard-reading-modal__save", found);
	return assertNote("Hoard/Books", externalId);
}

async function addGame({ query, title, externalId }) {
	await openTabAdd(5, ".hoard-view__tab-content .hoard-toolbar__add-btn");
	await waitForSelector(".hoard-add-game input.hoard-modal__input");
	await click(".hoard-add-game input.hoard-modal__input");
	await type(query);
	await pickResult({ title });
	await waitForFilledTitle(".hoard-modal__form", title);
	const found = () => findNoteByExternalId(VAULT_PATH, "Hoard/Games", externalId) !== null;
	await submit(".hoard-modal__form .hoard-modal__btn-row .hoard-btn--primary", found);
	return assertNote("Hoard/Games", externalId);
}

export const KEYLESS_CASES = [
	["movie", () => addTitle({ kind: "Movie", query: "The Matrix", title: "The Matrix", externalId: "imdb:tt0133093" })],
	["show", () => addTitle({ kind: "TV Show", query: "Breaking Bad", title: "Breaking Bad", externalId: "imdb:tt0903747" })],
	["book", () => addBook({ query: "The Hobbit", title: "The Hobbit", metaIncludes: "Tolkien", externalId: /^openlibrary:OL\d+W$/ })],
	["game", () => addGame({ query: "Hades", title: "Hades", externalId: "steam:1145360" })],
];
