// Records a failed flow or scenario and keeps a screenshot of the screen it failed on.
import { screenshot } from "../lib/cli.mjs";

export function failWithScreenshot(ctx, label, e, shotName) {
	ctx.fail(`${label}: ${e instanceof Error ? e.message : String(e)}`);
	try {
		screenshot(`${ctx.out}/${shotName}.png`);
	} catch {
		// the failure above is the useful one
	}
}
