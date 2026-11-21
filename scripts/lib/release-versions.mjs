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
	if (versions[manifest.version] !== manifest.minAppVersion)
		problems.push(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
	for (const key of Object.keys(versions))
		if (isPrerelease(key)) problems.push(`versions.json lists the beta ${key}`);
	return problems;
}
