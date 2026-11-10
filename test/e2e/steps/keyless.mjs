// Step "keyless": search, pick and add a movie, a show, a book and a game without any API key. Needs the network
// (Cinemeta, Open Library, Steam Store); it adds notes to the vault, so it runs last and the smoke resets afterwards.
import { failWithScreenshot } from "../failure.mjs";
import { closeModals } from "../ui.mjs";
import { KEYLESS_CASES } from "../flows/keylessAdd.mjs";

async function run(ctx) {
	for (const [name, flow] of KEYLESS_CASES) {
		try {
			await flow();
		} catch (e) {
			failWithScreenshot(ctx, `keyless ${name}`, e, `keyless-${name}`);
		}
		await closeModals();
	}
}

export const keylessStep = { name: "keyless", run };
