import { describe, it, expect, vi, beforeEach } from "vitest";

const cli = vi.hoisted(() => ({ calls: [] as string[], failOn: "" }));
vi.mock("../scripts/lib/cli.mjs", () => ({
	ensureVault: () => {},
	evalJs: (js: string) => {
		cli.calls.push(js);
		if (cli.failOn && js.includes(cli.failOn)) throw new Error("cli timed out");
		return js.includes("enabledPlugins.has") ? "true" : "";
	},
}));
const { withPluginDisabled } = await import("../scripts/lib/plugin-toggle.mjs");

describe("withPluginDisabled", () => {
	beforeEach(() => {
		cli.calls = [];
		cli.failOn = "";
	});

	it("re-enables the plugin when removing stale modals fails after the disable", async () => {
		cli.failOn = ".modal-container";
		const fn = vi.fn();
		await expect(withPluginDisabled(fn)).rejects.toThrow("cli timed out");
		expect(fn).not.toHaveBeenCalled();
		expect(cli.calls.at(-1)).toBe("app.plugins.enablePlugin('hoard')");
	});

	it("runs fn live between disable and enable", async () => {
		const fn = vi.fn();
		await withPluginDisabled(fn);
		expect(fn).toHaveBeenCalledWith(true);
		expect(cli.calls.at(-1)).toBe("app.plugins.enablePlugin('hoard')");
	});
});
