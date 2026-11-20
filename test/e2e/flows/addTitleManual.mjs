// Flow: add a title by hand (no API) through the add-title modal; the note on disk must hold what was entered.
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, type, waitForSelector } from "../ui.mjs";
import { EXPECTED } from "../expected.mjs";
import { readNote } from "../note.mjs";
import { chooseOption, runCommand } from "./common.mjs";

const TITLE = "Smoke Manual Title";
const SOURCE_TYPE_SELECT = ".hoard-add-modal > .hoard-modal__row:first-child select";
const TYPE_SELECT = ".hoard-modal__form > .hoard-modal__row:not(.hoard-modal__row--pair) select";
const STATUS_SELECT = ".hoard-modal__form .hoard-modal__pair-cell:first-child select";
const TITLE_INPUT = ".hoard-modal__form input[type=text]";
const SAVE = ".hoard-modal__form .hoard-modal__btn-row .hoard-btn--primary";
const COUNT = "String(app.plugins.plugins['hoard'].dataManager.getTitles().length)";

export async function addTitleManual() {
	runCommand("hoard:add-title");
	await waitForSelector(TITLE_INPUT);
	await chooseOption(SOURCE_TYPE_SELECT, "Movie");
	await chooseOption(TYPE_SELECT, "Movie");
	await chooseOption(STATUS_SELECT, "Watching");
	await click(TITLE_INPUT);
	await type(TITLE);
	assert(evalJs(`document.querySelector(${JSON.stringify(TITLE_INPUT)}).value`) === TITLE, "title input value missing");
	await click(SAVE);

	await waitFor(() => evalJs(COUNT) === String(EXPECTED.watch + 1), 10000);
	const path = `Hoard/Movie/${TITLE}.md`;
	await waitFor(() => evalJs(`String(!!app.vault.getFileByPath(${JSON.stringify(path)}))`) === "true", 10000);
	// the note is written by processFrontMatter after the file exists
	await waitFor(() => readNote(VAULT_PATH, path).props.Status === "Watching", 10000);
	const { props } = readNote(VAULT_PATH, path);
	assert(props.Name === TITLE, `title: ${props.Name}`);
	assert(props.Type === "Movie", `type: ${props.Type}`);
	assert(props["Source Type"] === "Movie", `source type: ${props["Source Type"]}`);
	assert(props.Status === "Watching", `status: ${props.Status}`);
}
