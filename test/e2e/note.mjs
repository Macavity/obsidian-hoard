// Read notes straight from disk and diff them: the note is the record, so flows assert on the file, not on the UI.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Returns `{ props, body, raw }` of the note at the vault-relative path. */
export function readNote(vaultPath, rel) {
	const raw = readFileSync(join(vaultPath, rel), "utf8");
	const m = FRONTMATTER.exec(raw);
	if (!m) return { props: {}, body: raw, raw };
	return { props: parse(m[1]) ?? {}, body: raw.slice(m[0].length), raw };
}

/** Names of properties that were added, removed or changed (deep equality). */
export function changedProps(before, after) {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...keys].filter((k) => !(k in before && k in after && isDeepStrictEqual(before[k], after[k])));
}

/** The body without the `## <heading>` section (up to the next `## ` heading or the end). */
export function bodyWithout(body, heading) {
	const lines = body.split("\n");
	const out = [];
	let skipping = false;
	for (const line of lines) {
		if (/^## /.test(line)) skipping = line.trim() === `## ${heading}`;
		if (!skipping) out.push(line);
	}
	return out.join("\n");
}

/**
 * The note directly in the vault-relative folder `dir` whose `External ID` equals `expected` (a string) or matches it (a
 * RegExp): `{ path, props, body, raw }`, or null. Finds an added note without knowing its file name.
 */
export function findNoteByExternalId(vaultPath, dir, expected) {
	if (!existsSync(join(vaultPath, dir))) return null;
	const matches = (id) => typeof id === "string" && (typeof expected === "string" ? id === expected : expected.test(id));
	for (const file of readdirSync(join(vaultPath, dir))) {
		if (!file.endsWith(".md")) continue;
		const path = `${dir}/${file}`;
		let note;
		try {
			note = readNote(vaultPath, path);
		} catch {
			continue; // a fixture with broken properties
		}
		if (matches(note.props["External ID"])) return { path, ...note };
	}
	return null;
}
