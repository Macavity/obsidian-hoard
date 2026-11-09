// Step "flows": click-through flows (add, status + episode, detail edit) that assert on the notes on disk.
import { failWithScreenshot } from "../failure.mjs";
import { closeModals } from "../../lib/ui.mjs";
import { run as addTitleManual } from "../flows/addTitleManual.mjs";
import { run as statusEpisode } from "../flows/statusEpisode.mjs";
import { run as detailEdit } from "../flows/detailEdit.mjs";

const FLOWS = [
	["addTitleManual", addTitleManual],
	["statusEpisode", statusEpisode],
	["detailEdit", detailEdit],
];

async function run(ctx) {
	for (const [name, flow] of FLOWS) {
		try {
			await flow(ctx);
		} catch (e) {
			failWithScreenshot(ctx, name, e, `flow-${name}`);
		}
		await closeModals();
	}
}

export const flowsStep = { name: "flows", run };
