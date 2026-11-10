// What the fork WatchLog scenario must yield; read by the flow and by test/scenarioData.test.ts.
export const FORK_EXPECT = {
	kind: "fork",
	titles: 5,
	// imported notes carry the current property names
	sampleProps: ["Name", "Type", "Status"],
	sample: { path: "Hoard/TV Show/The Wire.md", title: "The Wire", type: "TV Show", status: "Watching" },
};
