import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { compareVersions, isPrerelease, bumpFiles, checkConsistency } from "../scripts/lib/release-versions.mjs";

const json = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

describe("compareVersions", () => {
	it.each([
		["0.5.0", "0.4.0", 1],
		["0.4.0", "0.4.0", 0],
		["0.5.0", "0.5.0-beta.2", 1],
		["0.5.0-beta.10", "0.5.0-beta.2", 1],
		["0.5.0-beta.0", "0.4.0", 1],
		["0.10.0", "0.9.9", 1],
		["0.4.0", "0.5.0", -1],
	])("%s vs %s", (a, b, sign) => expect(Math.sign(compareVersions(a, b))).toBe(sign));

	it("rejects a v prefix", () => expect(() => compareVersions("v1.0.0", "1.0.0")).toThrow());
});

describe("isPrerelease", () => {
	it("tells beta from stable", () => {
		expect(isPrerelease("0.5.0-beta.1")).toBe(true);
		expect(isPrerelease("0.5.0")).toBe(false);
	});
});

describe("bumpFiles", () => {
	const manifest = { version: "0.4.0", minAppVersion: "1.11.5" };
	const versions = { "0.4.0": "1.11.5" };

	it("leaves manifest and versions alone for a beta", () =>
		expect(bumpFiles({ target: "0.5.0-beta.0", manifest, versions })).toBeNull());

	it("writes a stable version, also when minAppVersion did not change", () =>
		expect(bumpFiles({ target: "0.5.0", manifest, versions })).toEqual({
			manifest: { version: "0.5.0", minAppVersion: "1.11.5" },
			versions: { "0.4.0": "1.11.5", "0.5.0": "1.11.5" },
		}));

	it("does not mutate its input", () => {
		bumpFiles({ target: "0.5.0", manifest, versions });
		expect(manifest.version).toBe("0.4.0");
		expect(Object.keys(versions)).toEqual(["0.4.0"]);
	});
});

describe("checkConsistency", () => {
	const manifest = { version: "0.4.0", minAppVersion: "1.11.5" };
	const versions = { "0.4.0": "1.11.5" };

	it("accepts equal versions", () =>
		expect(checkConsistency({ packageVersion: "0.4.0", manifest, versions })).toEqual([]));
	it("accepts a beta above stable", () =>
		expect(checkConsistency({ packageVersion: "0.5.0-beta.1", manifest, versions })).toEqual([]));
	it("rejects a beta not above stable", () =>
		expect(checkConsistency({ packageVersion: "0.4.0-beta.1", manifest, versions })).not.toEqual([]));
	it("rejects a stable package version that differs from the manifest", () =>
		expect(checkConsistency({ packageVersion: "0.5.0", manifest, versions })).not.toEqual([]));
	it("rejects a manifest version missing from versions.json", () =>
		expect(checkConsistency({ packageVersion: "0.4.0", manifest, versions: {} })).not.toEqual([]));
	it("rejects a wrong minAppVersion in versions.json", () =>
		expect(checkConsistency({ packageVersion: "0.4.0", manifest, versions: { "0.4.0": "1.11.0" } })).not.toEqual([]));
	it("rejects a prerelease key in versions.json", () =>
		expect(checkConsistency({ packageVersion: "0.4.0", manifest, versions: { ...versions, "0.5.0-beta.0": "1.11.5" } })).not.toEqual([]));
	it("holds for the repository files", () =>
		expect(checkConsistency({
			packageVersion: json<{ version: string }>("package.json").version,
			manifest: json<{ version: string; minAppVersion: string }>("manifest.json"),
			versions: json<Record<string, string>>("versions.json"),
		})).toEqual([]));
});
