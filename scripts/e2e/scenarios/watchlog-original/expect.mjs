// What the original WatchLog scenario must yield; read by the flow and by test/scenarioData.test.ts.
import { reportNotePath } from "../common.mjs";

export const EXPECT = {
	kind: "original",
	titles: 5,
	reportNote: reportNotePath(),
	sample: { path: "Hoard/TV Show/The Wire.md", title: "The Wire", type: "TV Show", status: "Watching" },
};
