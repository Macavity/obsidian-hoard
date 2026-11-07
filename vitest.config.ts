import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL("./test/__mocks__/obsidian.ts", import.meta.url)),
		},
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["test/setup.ts"],
		include: ["test/**/*.test.ts"],
		coverage: {
			// Istanbul JSON feeds fallow's CRAP scores (see `health.coverage` in .fallowrc.json).
			provider: "istanbul",
			reporter: ["json"],
			reportsDirectory: "coverage",
			include: ["src/**", "test/domPolyfills.ts"],
			// vitest excludes `test/**` by default; the setup polyfills should count.
			exclude: ["**/*.test.ts", "test/__mocks__/**"],
		},
	},
});
