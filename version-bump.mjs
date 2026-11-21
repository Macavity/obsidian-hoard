import { readFileSync, writeFileSync } from "fs";
import { bumpFiles } from "./scripts/lib/release-versions.mjs";

// Runs from `pnpm version`. A beta (0.5.0-beta.1) only changes package.json; a stable version is written
// to manifest.json and always gets its own versions.json entry with the current minAppVersion.
const target = process.env.npm_package_version;
if (!target) throw new Error("npm_package_version is not set; run through `pnpm version`");

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const next = bumpFiles({ target, manifest: read("manifest.json"), versions: read("versions.json") });
if (next) {
	writeFileSync("manifest.json", JSON.stringify(next.manifest, null, "\t"));
	writeFileSync("versions.json", JSON.stringify(next.versions, null, "\t"));
}
