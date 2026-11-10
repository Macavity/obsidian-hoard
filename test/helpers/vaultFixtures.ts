import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { COMMON_PROPS } from "../../src/storage/properties";
import { VaultLayout } from "../../src/storage/VaultLayout";
import { decodeTitle } from "../../src/storage/titleCodec";
import { decodeBook, decodeManga } from "../../src/storage/readingCodec";
import { decodeGame } from "../../src/storage/gameCodec";
import { parseHistoryLine } from "../../src/storage/historyLine";
import { GAME_AUTO_STATUS, isReleaseDateFuture } from "../../src/types";
import type { Book, Game, HoardTitle, Manga } from "../../src/types";

const VAULT = resolve(fileURLToPath(import.meta.url), "../../../hoard-test-vault");
const ROOT = "Hoard";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export interface AirtimeFixture { kind: "title" | "book" | "manga" | "game"; id: string }

export interface VaultFixtures {
	titles: HoardTitle[];
	books: Book[];
	manga: Manga[];
	games: Game[];
	/** Mirrors `DataManager.getAirtimeEntries()`: manual schedules plus derived "To be released" cards. */
	airtimeEntries: AirtimeFixture[];
	historyEntries: { timestamp: string; action: string; target: string }[];
	customLists: string[];
	/** Entry notes the index skips: unreadable properties or a decoder error. */
	skipped: string[];
	/** Vault-relative paths of notes whose properties carry `External ID`. */
	withExternalId: string[];
	/** Vault-relative paths of every Markdown note. */
	paths: string[];
}

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		if (e.name.startsWith(".")) return [];
		const full = join(dir, e.name);
		return e.isDirectory() ? walk(full) : [full];
	});
}

/** Like Obsidian's metadata cache: the properties block, or null when absent or not valid YAML. */
function properties(src: string): Record<string, unknown> | null {
	const m = FRONTMATTER.exec(src);
	if (!m) return null;
	try {
		const v: unknown = parse(m[1] ?? "");
		return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function watchTypes(): string[] {
	const base = parse(readFileSync(join(VAULT, ROOT, "Hoard.base"), "utf8")) as { hoard?: { types?: { name: string }[] } };
	return (base.hoard?.types ?? []).map((t) => t.name);
}

function hasAirtime(e: { airtime?: unknown; status: string; releaseDate: string | null | undefined }, kind: AirtimeFixture["kind"]): boolean {
	if (e.airtime) return true;
	if (!e.releaseDate) return false;
	if (kind === "title") return e.status === "To be released";
	const auto = kind === "game" ? GAME_AUTO_STATUS : "To be released";
	return e.status === auto || isReleaseDateFuture(e.releaseDate);
}

function historyOf(src: string): VaultFixtures["historyEntries"] {
	return src.split("\n").flatMap((line) => {
		const l = parseHistoryLine(line.replace(/\r$/, ""));
		return l ? [{ timestamp: l.timestamp, action: l.action, target: l.target }] : [];
	});
}

/** Decodes one entry note into `out`; unreadable properties or a decoder error land in `skipped`. */
function decodeEntry(c: NonNullable<ReturnType<VaultLayout["classify"]>>, path: string, src: string, out: VaultFixtures): void {
	const fm = properties(src);
	if (!fm || Object.keys(fm).length === 0) {
		out.skipped.push(path);
		return;
	}
	if (COMMON_PROPS.externalId in fm) out.withExternalId.push(path);
	try {
		if (c.kind === "title") out.titles.push(decodeTitle(c.id, fm, undefined).entry);
		else if (c.kind === "book") out.books.push(decodeBook(c.id, fm, []).entry);
		else if (c.kind === "manga") out.manga.push(decodeManga(c.id, fm, []).entry);
		else out.games.push(decodeGame(c.id, fm).entry);
	} catch {
		out.skipped.push(path);
	}
}

function airtimeOf(out: VaultFixtures): AirtimeFixture[] {
	const titles = out.titles.filter((t) => !t.maybe && hasAirtime(t, "title")).map((t) => ({ kind: "title" as const, id: t.id }));
	const others = (["book", "manga", "game"] as const).flatMap((kind) => {
		const list = kind === "book" ? out.books : kind === "manga" ? out.manga : out.games;
		return list.filter((e) => hasAirtime(e, kind)).map((e) => ({ kind, id: e.id }));
	});
	return [...titles, ...others];
}

/** Reads `hoard-test-vault/` from disk and runs the real codecs the plugin uses. */
export function decodeVaultFixtures(): VaultFixtures {
	const types = watchTypes();
	const layout = new VaultLayout(ROOT, () => types);
	const out: VaultFixtures = {
		titles: [], books: [], manga: [], games: [], airtimeEntries: [], historyEntries: [],
		customLists: [], skipped: [], withExternalId: [], paths: [],
	};
	const lists = `${layout.customListsFolder}/`;

	const notes = walk(VAULT).map((f) => relative(VAULT, f).split(sep).join("/")).filter((p) => p.endsWith(".md")).sort();
	for (const path of notes) {
		out.paths.push(path);
		const src = readFileSync(join(VAULT, path), "utf8");
		const c = layout.classify(path);
		if (path === layout.historyPath) out.historyEntries.push(...historyOf(src));
		else if (path.startsWith(lists) && !path.slice(lists.length).includes("/")) out.customLists.push(path.slice(lists.length, -3));
		else if (c) decodeEntry(c, path, src, out);
	}
	out.airtimeEntries = airtimeOf(out);
	return out;
}
