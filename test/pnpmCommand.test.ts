import { describe, it, expect } from "vitest";
import { pnpmCommand } from "../scripts/lib/cli.mjs";

describe("pnpmCommand", () => {
	it("spawns pnpm directly outside Windows", () => {
		expect(pnpmCommand(["vault:reset"], "darwin")).toEqual(["pnpm", ["vault:reset"]]);
		expect(pnpmCommand(["build"], "linux")).toEqual(["pnpm", ["build"]]);
	});

	it("goes through cmd.exe on Windows, where pnpm is a batch file", () => {
		expect(pnpmCommand(["vault:link-test"], "win32")).toEqual(["cmd.exe", ["/d", "/c", "pnpm", "vault:link-test"]]);
	});

	it("refuses arguments cmd.exe would interpret", () => {
		expect(() => void pnpmCommand(["build", "& del x"], "win32")).toThrow("not a plain word");
		expect(() => void pnpmCommand(["%PATH%"], "win32")).toThrow("not a plain word");
	});
});
