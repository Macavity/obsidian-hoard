// Flows: a fresh install without API keys finds, fills and adds a movie, a show, a book and a game through the add wizard
// (Cinemeta, Open Library, Steam Store). Each note on disk must carry the source's External ID and a cover.
import { evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, type, waitForSelector } from "../ui.mjs";
import { findNoteByExternalId } from "../note.mjs";
import { chooseOption, openAddWizard } from "./common.mjs";

const FORM = ".hoard-add-wizard__form .hoard-modal__form";
const TYPE_SELECT = `${FORM} > .hoard-modal__row:not(.hoard-modal__row--pair) select`;
const SUBMIT = `${FORM} .hoard-modal__btn-row .hoard-btn--primary`;
const PICK_ATTR = "data-smoke-pick";
const PICKED = `[${PICK_ATTR}]`;
const DUPLICATE_CONTINUE = ".hoard-modal__duplicate-warning .hoard-btn--primary";

/** The search results are network answers: wait for the card in its kind's section, mark it, and click it like a user would. */
async function pickResult({ kind, title, metaIncludes = "" }) {
	const find = `(() => {
	const cards = [...document.querySelectorAll('.hoard-result-sections__section[data-section="${kind}"] .hoard-search-picker__result-card')];
	const hit = cards.find((c) => c.querySelector('.hoard-search-picker__result-title')?.textContent === ${JSON.stringify(title)} && (c.querySelector('.hoard-search-picker__result-meta')?.textContent ?? '').includes(${JSON.stringify(metaIncludes)}));
	if (!hit) return "false";
	hit.setAttribute(${JSON.stringify(PICK_ATTR)}, "1");
	return "true";
})()`;
	await waitFor(() => evalJs(find) === "true", 30000, 500);
	await click(PICKED);
}

/** Waits until a text input of the form holds the (prefilled) title: the pick is resolved and applied. */
async function waitForFilledTitle(title) {
	const filled = `String([...document.querySelectorAll(${JSON.stringify(`${FORM} input`)})].some((i) => i.value.includes(${JSON.stringify(title)})))`;
	await waitFor(() => evalJs(filled) === "true", 30000, 500);
}

/** Clicks the submit button; a name-based duplicate warning (a fixture with the same title) is confirmed like a user would. */
async function submit(notePresent) {
	await click(SUBMIT);
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

async function addViaWizard({ kind, dir, typeName, query, title, metaIncludes, externalId }) {
	await openAddWizard();
	await click(".hoard-add-wizard__query");
	await type(query);
	await pickResult({ kind, title, metaIncludes });
	await waitForFilledTitle(title);
	// the pick re-renders the form, so the label comes after it
	if (typeName) await chooseOption(TYPE_SELECT, typeName);
	const found = () => findNoteByExternalId(VAULT_PATH, dir, externalId) !== null;
	await submit(found);
	return assertNote(dir, externalId);
}

export const KEYLESS_CASES = [
	["movie", () => addViaWizard({ kind: "movie", dir: "Hoard/Movie", typeName: "Movie", query: "The Matrix", title: "The Matrix", externalId: "imdb:tt0133093" })],
	["show", () => addViaWizard({ kind: "series", dir: "Hoard/TV Show", typeName: "TV Show", query: "Breaking Bad", title: "Breaking Bad", externalId: "imdb:tt0903747" })],
	["book", () => addViaWizard({ kind: "book", dir: "Hoard/Books", query: "The Hobbit", title: "The Hobbit", metaIncludes: "Tolkien", externalId: /^openlibrary:OL\d+W$/ })],
	["game", () => addViaWizard({ kind: "game", dir: "Hoard/Games", query: "Hades", title: "Hades", externalId: "steam:1145360" })],
];
