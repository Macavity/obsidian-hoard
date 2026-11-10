// Shared by the WatchLog scenarios: the expected report note path and the wizard click-through.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, waitForSelector } from "../ui.mjs";
import { readNote } from "../note.mjs";

const pad = (n) => String(n).padStart(2, "0");

/** Hoard root + `WatchLog-Import <local date>.md`, the name `writeReportNote` picks on a fresh vault. */
export function reportNotePath(date = new Date()) {
	return `Hoard/WatchLog-Import ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.md`;
}

/** The report note written today or, for a run across midnight, yesterday; null when neither exists. */
export function findReportNote(vault, now = new Date()) {
	const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
	return [reportNotePath(now), reportNotePath(yesterday)].find((p) => existsSync(join(vault, p))) ?? null;
}

const WIZARD = ".hoard-onboarding-modal";
const btn = (action) => `${WIZARD} [data-action="${action}"]`;
const P = "app.plugins.plugins['hoard']";

/** Clicks the button of the wizard step that is showing; the step re-renders, so wait for the button first. */
async function step(action) {
	await waitForSelector(btn(action), 30000);
	await click(btn(action));
}

/**
 * Wizard: found (import the pre-selected source) -> import runs -> result (save the report, next) -> cleanup (skip: the
 * WatchLog data stays, the cleanup path is unit-tested) -> done (close). Returns once the plugin left the wizard.
 */
export async function clickThroughWizard() {
	await waitForSelector(WIZARD, 30000);
	await step("import");
	await step("report");
	await waitFor(() => evalJs(`String(!!document.querySelector('${WIZARD} .hoard-onboarding-hint'))`) === "true", 10000);
	await step("next");
	await step("skip");
	await step("close");
	await waitFor(() => evalJs(`String(${P}.importRunning === false)`) === "true", 30000);
}

/** Asserts the imported library: counts, one sample note, the report note and the stored decision. */
export async function assertImported(expect, dataJsonPath) {
	assert(existsSync(join(VAULT_PATH, "Hoard", "Hoard.base")), "Hoard/Hoard.base missing");
	await waitFor(() => evalJs(`String(${P}.dataManager.getTitles().length)`) === String(expect.titles), 15000);
	const { sample } = expect;
	await waitFor(() => readNote(VAULT_PATH, sample.path).props.status === sample.status, 10000);
	const { props } = readNote(VAULT_PATH, sample.path);
	assert(props.title === sample.title, `title: ${props.title}`);
	assert(props.type === sample.type, `type: ${props.type}`);
	assert(props.status === sample.status, `status: ${props.status}`);
	assert(findReportNote(VAULT_PATH) !== null, `report note ${reportNotePath()} missing`);
	await waitFor(() => JSON.parse(readFileSync(dataJsonPath, "utf8")).ui?.watchlogImport?.[expect.kind] === "imported", 10000);
}
