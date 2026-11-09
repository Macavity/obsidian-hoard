import { runInNewContext } from "node:vm";
import { describe, it, expect } from "vitest";
import { clickPointScript } from "../scripts/lib/ui.mjs";

const run = (sel: string): unknown => runInNewContext(clickPointScript(sel), { document }) as unknown;
const rect = (left: number, top: number, width: number, height: number) =>
	({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() { return {}; } }) as DOMRect;

describe("clickPointScript", () => {
	it("reports a missing element", () => {
		document.body.innerHTML = "";
		expect(run(".nope")).toEqual({ error: "missing" });
	});
	it("reports a hidden element", () => {
		document.body.innerHTML = '<button class="b" style="display:none">x</button>';
		expect(run(".b")).toEqual({ error: "hidden" });
	});
	it("reports a covered element", () => {
		document.body.innerHTML = '<button class="b">x</button><div class="cover"></div>';
		const b = document.querySelector(".b")!;
		b.getBoundingClientRect = () => rect(0, 0, 20, 10);
		b.getClientRects = () => [rect(0, 0, 20, 10)] as unknown as DOMRectList;
		document.elementFromPoint = () => document.querySelector(".cover");
		expect(run(".b")).toEqual({ error: "covered" });
	});
	it("returns the centre of a clickable element", () => {
		document.body.innerHTML = '<button class="b"><span class="inner">x</span></button>';
		const b = document.querySelector(".b")!;
		b.getBoundingClientRect = () => rect(10, 20, 40, 10);
		b.getClientRects = () => [rect(10, 20, 40, 10)] as unknown as DOMRectList;
		document.elementFromPoint = () => document.querySelector(".inner");
		expect(run(".b")).toEqual({ x: 30, y: 25 });
	});
});
