import { readFileSync } from "fs";
import { dirname, join } from "path";

/** Inlines every `@import "…";` line of `entry` recursively, verbatim and in order (no CSS rewriting). */
export function bundleStyles(entry) {
	return readFileSync(entry, "utf8").replace(/^@import "(.+?)";\r?\n?/gm, (_, rel) =>
		bundleStyles(join(dirname(entry), rel)),
	);
}
