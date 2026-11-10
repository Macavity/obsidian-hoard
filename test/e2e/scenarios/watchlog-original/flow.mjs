// Flow: the wizard imports the source, the imported library matches EXPECT.
import { join } from "node:path";
import { REPO, VAULT_PATH } from "../../../../scripts/lib/cli.mjs";
import { pluginDataDir } from "../../../../scripts/lib/seed.mjs";
import { assertImported, clickThroughWizard } from "../common.mjs";
import { ORIGINAL_EXPECT as EXPECT } from "./expect.mjs";

export async function runOriginal() {
	await clickThroughWizard();
	await assertImported(EXPECT, join(pluginDataDir(VAULT_PATH, join(REPO, "dist")), "data.json"));
}
