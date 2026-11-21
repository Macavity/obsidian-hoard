// Release workflow, check job: `git ls-remote --tags origin | node scripts/release-decide.mjs`.
// Writes kind (stable | beta | none) and version to $GITHUB_OUTPUT; fails on inconsistent version files
// or a pushed tag that matches neither channel.
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";
import { checkConsistency, decideRelease, parseLsRemoteTags } from "./lib/release-versions.mjs";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const manifest = read("manifest.json");
const latest = read("package.json").version;

const fail = (message) => {
	console.log(`::error::${message}`);
	process.exit(1);
};

const problems = checkConsistency({ packageVersion: latest, manifest, versions: read("versions.json") });
if (problems.length) fail(problems.join("; "));

const result = decideRelease({
	stable: manifest.version,
	latest,
	tags: parseLsRemoteTags(readFileSync(0, "utf8")),
	ref: { type: process.env.GITHUB_REF_TYPE === "tag" ? "tag" : "branch", name: process.env.GITHUB_REF_NAME ?? "" },
	event: process.env.GITHUB_EVENT_NAME === "workflow_dispatch" ? "workflow_dispatch" : "push",
});
if (result.error) fail(result.error);

console.log(result.kind === "none" ? "Every version is tagged; nothing to release" : `Releasing ${result.kind} ${result.version}`);
const out = `kind=${result.kind}\nversion=${result.version ?? ""}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, out);
else process.stdout.write(out);
