import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { clickPointScript } from "./e2e/ui.mjs";

const run = (sel: string): unknown => runInNewContext(clickPointScript(sel), { document }) as unknown;
const rect = (left: number, top: number, width: number, height: number) =>
	({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return {}; } }) as DOMRect;

/** Replaces the body with `<button class="b">` (optionally hidden, with an inner span) and any extra sibling classes. */
function mount(opts: { hidden?: boolean; inner?: boolean; siblings?: string[] } = {}): HTMLButtonElement {
	document.body.replaceChildren();
	const b = document.createElement("button");
	b.className = "b";
	if (opts.hidden) b.style.display = "none";
	const label = document.createElement(opts.inner ? "span" : "b");
	if (opts.inner) label.className = "inner";
	label.textContent = "x";
	b.append(label);
	document.body.append(b);
	for (const cls of opts.siblings ?? []) {
		const d = document.createElement("div");
		d.className = cls;
		document.body.append(d);
	}
	return b;
}

describe("clickPointScript", () => {
	it("reports a missing element", () => {
		document.body.replaceChildren();
		expect(run(".nope")).toEqual({ error: "missing" });
	});
	it("reports a hidden element", () => {
		mount({ hidden: true });
		expect(run(".b")).toEqual({ error: "hidden" });
	});
	it("reports a covered element", () => {
		const b = mount({ siblings: ["cover"] });
		b.getBoundingClientRect = () => rect(0, 0, 20, 10);
		b.getClientRects = () => [rect(0, 0, 20, 10)] as unknown as DOMRectList;
		document.elementFromPoint = () => document.querySelector(".cover");
		expect(run(".b")).toEqual({ error: "covered" });
	});
	it("returns the centre of a clickable element", () => {
		const b = mount({ inner: true });
		b.getBoundingClientRect = () => rect(10, 20, 40, 10);
		b.getClientRects = () => [rect(10, 20, 40, 10)] as unknown as DOMRectList;
		document.elementFromPoint = () => document.querySelector(".inner");
		expect(run(".b")).toEqual({ x: 30, y: 25 });
	});
});
