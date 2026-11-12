// Flow: change the rating and the Notes text in the detail modal of the detail fixture.
// The detail modal has no review control, so the rating stands in. Allowed changes: `rating`, `dateModified` (every
// foreground write stamps it) and `priority`: the fixture is Completed without a priority key, which decodes as Medium,
// and updateTitle clears the priority of a Completed title, so the first write persists an explicit `Priority: ""`.
// The foreign `## Mine` section must survive.
import { assert, evalJs, VAULT_PATH, waitFor } from "../../../scripts/lib/cli.mjs";
import { click, press, type } from "../ui.mjs";
import { FIXTURE_DETAIL_TITLE } from "../expected.mjs";
import { bodyWithout, changedProps, readNote } from "../note.mjs";
import { openDetail, waitStable } from "./common.mjs";

const TITLE_ID = "Animation/Spider-Verse";
const NOTES = ".hoard-detail .hoard-detail__notes-input";
const STAR = ".hoard-detail .hoard-detail__stars .hoard-star-rating__star:nth-child(3)";
const MARKER = " Smoke note edit.";

export async function detailEdit() {
	const before = readNote(VAULT_PATH, FIXTURE_DETAIL_TITLE);
	assert(before.props.Rating !== 3, "fixture rating already 3");
	await openDetail(TITLE_ID);

	await click(NOTES);
	await type(MARKER);
	// the notes save on blur: Tab leaves the textarea, and the layout is let to settle before the star is clicked
	await press("Tab");
	await waitFor(() => readNote(VAULT_PATH, FIXTURE_DETAIL_TITLE).body.includes(MARKER.trim()), 10000);
	await waitStable(STAR);
	await click(STAR);
	try {
		await waitFor(() => readNote(VAULT_PATH, FIXTURE_DETAIL_TITLE).props.Rating === 3, 10000);
	} catch (e) {
		const now = readNote(VAULT_PATH, FIXTURE_DETAIL_TITLE);
		const ui = evalJs(`JSON.stringify([document.querySelector(".hoard-detail__notes-input")?.value, document.querySelector(".hoard-detail__stars")?.textContent, document.querySelectorAll(".modal-container").length])`);
		throw new Error(`${e.message}; note rating=${now.props.Rating} body=${JSON.stringify(now.body)} ui=${ui}`);
	}

	const after = readNote(VAULT_PATH, FIXTURE_DETAIL_TITLE);
	const changed = changedProps(before.props, after.props).sort();
	assert(JSON.stringify(changed) === JSON.stringify(["Date Modified", "Priority", "Rating"]), `changed properties: ${changed.join(", ")}`);
	assert(after.props.Priority === "", `priority: ${JSON.stringify(after.props.Priority)}`);
	assert(bodyWithout(after.body, "Notes") === bodyWithout(before.body, "Notes"), "body outside ## Notes changed");
	assert(after.body.includes("## Mine") && after.body.includes("Foreign section"), "foreign section lost");
}
