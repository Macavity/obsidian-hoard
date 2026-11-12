import { describe, it, expect, vi, beforeEach } from "vitest";

/** A native `<select>` as CDP input sees it: `popup` decides whether a click opens the native popup (Windows) or not (macOS). */
const select = vi.hoisted(() => ({
	options: [
		["Anime", "Anime"],
		["Movie", "Film"],
		["TV Show", "Serie"],
	] as [string, string][],
	value: "Anime",
	popup: false,
	open: false,
	highlighted: "",
	typed: "",
	events: [] as string[],
	/** Type-ahead: selects on a closed select, only highlights in an open popup. */
	key(ch: string) {
		this.typed += ch;
		const hit = this.options.find(([, label]) => label.toLowerCase().startsWith(this.typed.toLowerCase()))?.[0];
		if (hit === undefined) return;
		if (this.open) this.highlighted = hit;
		else this.value = hit;
	},
}));

vi.mock("../scripts/lib/cli.mjs", () => ({
	assert: (cond: unknown, msg: string) => {
		if (!cond) throw new Error(`Assertion failed: ${msg}`);
	},
	evalJs: (code: string) => (code.includes(".options]") ? JSON.stringify(select.options) : select.value),
	obs: (_cmd: string, args: { params: string }) => {
		const p = JSON.parse(args.params) as { type: string; text?: string };
		if (p.type === "keyDown" && p.text) select.key(p.text);
		return "";
	},
	waitFor: () => Promise.resolve(true),
}));
vi.mock("./e2e/ui.mjs", () => ({
	click: () => {
		select.events.push("click");
		select.open = select.popup;
		return Promise.resolve();
	},
	press: (key: string) => {
		select.events.push(key);
		if (select.open && select.highlighted) select.value = select.highlighted;
		select.open = false;
		return Promise.resolve();
	},
	waitForSelector: () => Promise.resolve(),
}));
const { chooseOption } = await import("./e2e/flows/common.mjs");

describe("chooseOption", () => {
	beforeEach(() => Object.assign(select, { value: "Anime", popup: false, open: false, highlighted: "", typed: "", events: [] }));

	it("selects by type-ahead alone when the popup stays closed (macOS)", async () => {
		await chooseOption("select", "Movie");
		expect(select.value).toBe("Movie");
		expect(select.typed).toBe("F");
		expect(select.events).toEqual(["click"]);
	});

	it("commits the highlighted option with Enter when the popup opened (Windows)", async () => {
		select.popup = true;
		await chooseOption("select", "Movie");
		expect(select.value).toBe("Movie");
		expect(select.events).toEqual(["click", "Enter"]);
	});

	it("leaves a select alone that already holds the value", async () => {
		select.popup = true;
		await chooseOption("select", "Anime");
		expect(select.events).toEqual([]);
		expect(select.open).toBe(false);
	});

	it("fails on an unknown option", async () => {
		await expect(chooseOption("select", "Game")).rejects.toThrow("option Game missing in select");
	});

	it("fails when the value does not follow", async () => {
		select.options = [...select.options, ["Film Noir", "Film"]];
		try {
			await expect(chooseOption("select", "Film Noir")).rejects.toThrow("expected Film Noir, got Movie");
		} finally {
			select.options = select.options.slice(0, 3);
		}
	});
});
