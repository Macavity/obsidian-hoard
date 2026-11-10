import { describe, it, expect } from "vitest";
import { typeAheadPrefix } from "./e2e/flows/common.mjs";

describe("typeAheadPrefix", () => {
	it("takes one letter when no other label shares it", () => expect(typeAheadPrefix("Movie", ["TV Show", "Anime"])).toBe("M"));
	it("extends past shared prefixes, ignoring case", () => expect(typeAheadPrefix("Watching", ["watched", "Wishlist"])).toBe("Watchi"));
	it("returns the whole label when it is a prefix of another", () => expect(typeAheadPrefix("Book", ["Bookmark"])).toBe("Book"));
});
