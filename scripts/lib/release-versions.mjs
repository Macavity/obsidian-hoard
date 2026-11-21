// Version rules of the two release channels: manifest.json holds the stable version (the only one the
// community directory reads), package.json the newest one, which may be a beta like 0.5.0-beta.1.
// Used by version-bump.mjs, scripts/release-decide.mjs and test/releaseVersions.test.ts.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** @param {string} version */
function parse(version) {
	const m = SEMVER.exec(version);
	if (!m) throw new Error(`Not a version: ${version}`);
	return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

/** @param {string} a @param {string} b */
function compareIdentifiers(a, b) {
	const na = /^\d+$/.test(a), nb = /^\d+$/.test(b);
	if (na && nb) return Number(a) - Number(b);
	if (na !== nb) return na ? -1 : 1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {string} version @returns {boolean} */
export function isPrerelease(version) {
	return parse(version).pre.length > 0;
}

/** Semver order; negative when a < b. @param {string} a @param {string} b @returns {number} */
export function compareVersions(a, b) {
	const pa = parse(a), pb = parse(b);
	for (let i = 0; i < 3; i++) {
		const d = /** @type {number} */ (pa.core[i]) - /** @type {number} */ (pb.core[i]);
		if (d !== 0) return d;
	}
	if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
	for (let i = 0; i < Math.min(pa.pre.length, pb.pre.length); i++) {
		const d = compareIdentifiers(/** @type {string} */ (pa.pre[i]), /** @type {string} */ (pb.pre[i]));
		if (d !== 0) return d;
	}
	return pa.pre.length - pb.pre.length;
}

/**
 * New manifest.json and versions.json for a bump, or null for a beta, which only changes package.json.
 * @param {{ target: string, manifest: { version: string, minAppVersion: string }, versions: Record<string, string> }} input
 * @returns {{ manifest: { version: string, minAppVersion: string }, versions: Record<string, string> } | null}
 */
export function bumpFiles({ target, manifest, versions }) {
	if (isPrerelease(target)) return null;
	return {
		manifest: { ...manifest, version: target },
		versions: { ...versions, [target]: manifest.minAppVersion },
	};
}

/**
 * Problems with the three version files; empty when they agree.
 * @param {{ packageVersion: string, manifest: { version: string, minAppVersion: string }, versions: Record<string, string> }} input
 * @returns {string[]}
 */
export function checkConsistency({ packageVersion, manifest, versions }) {
	const problems = [];
	if (isPrerelease(packageVersion)) {
		if (compareVersions(packageVersion, manifest.version) <= 0)
			problems.push(`package.json beta ${packageVersion} must be above manifest.json ${manifest.version}`);
	} else if (packageVersion !== manifest.version) {
		problems.push(`package.json ${packageVersion} differs from manifest.json ${manifest.version}`);
	}
	// minAppVersion may be raised ahead of the next stable release; versions.json keeps the minimum the
	// released version shipped with, which Obsidian's fallback for older apps relies on.
	const shipped = versions[manifest.version];
	if (!shipped) problems.push(`versions.json lacks the stable version ${manifest.version}`);
	else if (compareVersions(shipped, manifest.minAppVersion) > 0)
		problems.push(`versions.json maps ${manifest.version} to ${shipped}, above manifest.json's minAppVersion ${manifest.minAppVersion}`);
	for (const key of Object.keys(versions))
		if (isPrerelease(key)) problems.push(`versions.json lists the beta ${key}`);
	return problems;
}

/** Tag names from `git ls-remote --tags origin`, without peeled `^{}` duplicates. @param {string} text @returns {string[]} */
export function parseLsRemoteTags(text) {
	return text
		.split("\n")
		.map((line) => line.split("\t")[1] ?? "")
		.filter((ref) => ref.startsWith("refs/tags/") && !ref.endsWith("^{}"))
		.map((ref) => ref.slice("refs/tags/".length));
}

/**
 * Which release a workflow run publishes. Stable comes from manifest.json, beta from a prerelease in package.json.
 * A run with every version tagged publishes nothing, also when started by hand: rebuilding main would replace
 * the assets of a published release with code it was never tested with.
 * @param {{ stable: string, latest: string, tags: readonly string[], ref: { type: "branch" | "tag", name: string }, event: "push" | "workflow_dispatch" }} input
 * @returns {{ kind: "stable" | "beta" | "none", version: string | null, error?: string }}
 */
export function decideRelease({ stable, latest, tags, ref }) {
	const beta = isPrerelease(latest) ? latest : null;
	if (ref.type === "tag") {
		if (ref.name === stable) return { kind: "stable", version: stable };
		if (ref.name === beta) return { kind: "beta", version: beta };
		return { kind: "none", version: null, error: `Tag ${ref.name} matches neither manifest.json ${stable} nor package.json ${latest}` };
	}
	if (!tags.includes(stable)) return { kind: "stable", version: stable };
	if (beta && !tags.includes(beta)) return { kind: "beta", version: beta };
	return { kind: "none", version: null };
}
