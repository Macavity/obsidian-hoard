import { describe, it, expect, vi } from "vitest";

const calls = vi.hoisted(() => ({ prepared: [] as string[] }));
vi.mock("./e2e/scenario.mjs", async (orig) => {
	const actual = await orig<typeof import("./e2e/scenario.mjs")>();
	return {
		...actual,
		prepareScenario: (name: string) => {
			calls.prepared.push(name);
			return Promise.resolve({ restore: () => Promise.reject(new actual.RestoreError("restore failed, backup kept in /tmp/x")) });
		},
	};
});
vi.mock("./e2e/scenarios/watchlog-original/flow.mjs", () => ({ runOriginal: () => Promise.resolve() }));
vi.mock("./e2e/scenarios/watchlog-fork/flow.mjs", () => ({ runFork: () => Promise.resolve() }));
const { scenariosStep } = await import("./e2e/steps/scenarios.mjs");

describe("scenarios step", () => {
	it("stops after a failed restore, so the next scenario cannot back up the previous one's data", async () => {
		const fails: string[] = [];
		await scenariosStep.run({ fail: (m: string) => fails.push(m) });
		expect(calls.prepared).toEqual(["watchlog-original"]);
		expect(fails).toEqual([expect.stringMatching(/watchlog-original: .*backup kept in \/tmp\/x/)]);
	});
});
