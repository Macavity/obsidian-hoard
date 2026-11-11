// Flow: tick the next episode and change the status in the detail modal of the edit fixture.
// Allowed changes: `Watched Episodes` (episode progress), `Status`, `Progress` (derived percent, rewritten with `Watched Episodes`) and `Date Modified`: every foreground write stamps it
// (docs/flows/entry-write.md); only background fills skip it. The body must stay byte-identical.
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, waitForSelector } from "../ui.mjs";
import { FIXTURE_EDIT_TITLE } from "../expected.mjs";
import { changedProps, readNote } from "../note.mjs";
import { openDetail } from "./common.mjs";

const TITLE_ID = "TV Show/Severance";
const NEXT_EPISODE = ".hoard-detail .hoard-accordion__episode-box:not(.is-watched)";
const STATUS_PILL = ".hoard-detail .hoard-detail__badge-row .hoard-reading-detail__status-wrap:nth-child(2) .hoard-reading-detail__status";
const NEW_STATUS = "Dropped";

export async function statusEpisode() {
	const before = readNote(VAULT_PATH, FIXTURE_EDIT_TITLE);
	await openDetail(TITLE_ID);

	await click(NEXT_EPISODE);
	await waitFor(() => readNote(VAULT_PATH, FIXTURE_EDIT_TITLE).props["Watched Episodes"] !== before.props["Watched Episodes"], 10000);

	await click(STATUS_PILL);
	await waitForSelector(".hoard-status-dropdown");
	// the dropdown lists the configured statuses without "To be released", in settings order
	const index = Number(evalJs(`String(app.plugins.plugins['hoard'].settings.statuses.filter((s) => s.name !== 'To be released').findIndex((s) => s.name === ${JSON.stringify(NEW_STATUS)}) + 1)`));
	assert(index > 0, `status ${NEW_STATUS} not configured`);
	await click(`.hoard-status-dropdown .hoard-status-dropdown__option:nth-child(${index})`);
	await waitFor(() => readNote(VAULT_PATH, FIXTURE_EDIT_TITLE).props.Status === NEW_STATUS, 10000);

	const after = readNote(VAULT_PATH, FIXTURE_EDIT_TITLE);
	const changed = changedProps(before.props, after.props).sort();
	assert(JSON.stringify(changed) === JSON.stringify(["Date Modified", "Progress", "Status", "Watched Episodes"]), `changed properties: ${changed.join(", ")}`);
	assert(after.props["Watched Episodes"] === "S01E01-E04", `watched: ${after.props["Watched Episodes"]}`);
	assert(after.body === before.body, "body changed");
}
