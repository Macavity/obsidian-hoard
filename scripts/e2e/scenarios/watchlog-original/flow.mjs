// Flow: the wizard imports the source, the imported library matches EXPECT.
import { join } from "node:path";
import { REPO, VAULT_PATH } from "../../../lib/cli.mjs";
import { pluginDataDir } from "../../../lib/seed.mjs";
import { assertImported, clickThroughWizard } from "../common.mjs";
import { EXPECT } from "./expect.mjs";

export { EXPECT };

export async function run() {
	await clickThroughWizard();
	await assertImported(EXPECT, join(pluginDataDir(VAULT_PATH, join(REPO, "dist")), "data.json"));
}
