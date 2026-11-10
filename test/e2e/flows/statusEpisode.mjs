// Flow: tick the next episode and change the status in the detail modal of the edit fixture.
// Allowed changes: `watched` (episode progress), `status`, `progress` (derived percent, rewritten with `watched`) and `dateModified`: every foreground write stamps it
// (docs/flows/entry-write.md); only background fills skip it. The body must stay byte-identical.
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, waitForSelector } from "../ui.mjs";
import { FIXTURE_EDIT_TITLE } from "../expected.mjs";
import { changedProps, readNote } from "../note.mjs";
import { openDetail } from "./common.mjs";

const TITLE_ID = "TV Show/Severance";
const NEXT_EPISODE = ".hoard-detail-modal .hoard-episode-box:not(.is-watched)";
const STATUS_PILL = ".hoard-detail-modal .hoard-detail-badge-row .hoard-reading-detail-status-wrap:nth-child(2) .hoard-reading-detail-status";
const NEW_STATUS = "Dropped";

export async function statusEpisode() {
	const before = readNote(VAULT_PATH, FIXTURE_EDIT_TITLE);
	await openDetail(TITLE_ID);

	await click(NEXT_EPISODE);
	await waitFor(() => readNote(VAULT_PATH, FIXTURE_EDIT_TITLE).props.watched !== before.props.watched, 10000);

	await click(STATUS_PILL);
	await waitForSelector(".hoard-reading-status-dropdown");
	// the dropdown lists the configured statuses without "To be released", in settings order
	const index = Number(evalJs(`String(app.plugins.plugins['hoard'].settings.statuses.filter((s) => s.name !== 'To be released').findIndex((s) => s.name === ${JSON.stringify(NEW_STATUS)}) + 1)`));
	assert(index > 0, `status ${NEW_STATUS} not configured`);
	await click(`.hoard-reading-status-dropdown .hoard-reading-status-option:nth-child(${index})`);
	await waitFor(() => readNote(VAULT_PATH, FIXTURE_EDIT_TITLE).props.status === NEW_STATUS, 10000);

	const after = readNote(VAULT_PATH, FIXTURE_EDIT_TITLE);
	const changed = changedProps(before.props, after.props).sort();
	assert(JSON.stringify(changed) === JSON.stringify(["dateModified", "progress", "status", "watched"]), `changed properties: ${changed.join(", ")}`);
	assert(after.props.watched === "S01E01-E04", `watched: ${after.props.watched}`);
	assert(after.body === before.body, "body changed");
}
