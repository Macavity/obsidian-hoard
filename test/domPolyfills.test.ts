import { describe, it, expect } from "vitest";

describe("Obsidian DOM polyfills", () => {
	it("createEl accepts a class string, class list, text and attributes", () => {
		const root = document.createElement("div");
		const a = root.createEl("span", "one");
		const b = root.createDiv({ cls: ["two", "three"], text: "hi", attr: { "data-x": "1" } });
		const c = root.createSpan();
		expect(a.className).toBe("one");
		expect(b.className).toBe("two three");
		expect(b.textContent).toBe("hi");
		expect(b.getAttribute("data-x")).toBe("1");
		expect(c.className).toBe("");
		expect(root.children.length).toBe(3);
	});

	it("provides detached-element globals and element helpers", () => {
		const el = createDiv({ cls: "x" });
		expect(createEl("p").tagName).toBe("P");
		expect(createSpan().tagName).toBe("SPAN");
		el.addClass("a", "b");
		el.removeClass("a");
		el.toggleClass("c", true);
		el.setText("t");
		el.setCssProps({ "--w": "1px" });
		expect(el.className).toBe("x b c");
		expect(el.textContent).toBe("t");
		expect(el.style.getPropertyValue("--w")).toBe("1px");
		expect(el.instanceOf(HTMLDivElement)).toBe(true);
		el.empty();
		expect(el.childNodes.length).toBe(0);
	});

	it("adds Array.prototype.remove", () => {
		const list = [1, 2, 3];
		list.remove(2);
		list.remove(9);
		expect(list).toEqual([1, 3]);
	});
});
