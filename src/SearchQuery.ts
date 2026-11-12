import Fuse from 'fuse.js';

/**
 * One searchable field. `text` feeds the fuzzy index, `number` feeds range tokens; a field may
 * carry either or both (year is both — bare "2020" is text, `year:>2020` is numeric).
 */
export interface SearchFieldSpec<T> {
	/** Canonical name, and the `field:` prefix users type. */
	name: string;
	/** Shown in the help modal. */
	label: string;
	/** Fuse weight; omit for numeric-only fields. */
	weight?: number;
	/** Extra accepted prefixes (dev → developer). */
	aliases?: string[];
	text?: (item: T) => string[];
	number?: (item: T) => number | null;
}

export interface SearchConfig<T> {
	id: (item: T) => string;
	fields: SearchFieldSpec<T>[];
}

type TextField<T> = SearchFieldSpec<T> & { text: (item: T) => string[] };
type NumberField<T> = SearchFieldSpec<T> & { number: (item: T) => number | null };

const hasText = <T>(f: SearchFieldSpec<T>): f is TextField<T> => f.text !== undefined;
const hasNumber = <T>(f: SearchFieldSpec<T>): f is NumberField<T> => f.number !== undefined;

type Comparator = '>' | '>=' | '<' | '<=' | '=';

const COMPARE: Record<Comparator, (n: number, value: number) => boolean> = {
	'>': (n, value) => n > value,
	'>=': (n, value) => n >= value,
	'<': (n, value) => n < value,
	'<=': (n, value) => n <= value,
	'=': (n, value) => n === value,
};

interface Comparison {
	op: Comparator;
	value: number;
}

interface Token {
	negated: boolean;
	/** Canonical field name, or null for "any field". */
	field: string | null;
	text: string;
	/** Quoted — exact substring, never fuzzy. */
	exact: boolean;
	/** Set when the value parsed as a numeric comparison. */
	compare: Comparison | null;
	/** Followed a `|` — ORs into the previous token instead of ANDing. */
	alternate: boolean;
}

// 0.24, not 0.25: Fuse's threshold is inclusive and 0.25 admits 2-edit fuzz
// ("avengers" -> "Passengers", 2/8 = 0.25)
const FUZZ_THRESHOLD = 0.24;

/** `-`, optional `field:`, then a "quoted phrase" or a bare run. */
const TOKEN_RE = /(-?)(?:([A-Za-z_][\w-]*):)?(?:"([^"]*)"|(\S+))/g;

const COMPARE_RE = /^(>=|<=|>|<|=)?\s*(-?\d+(?:\.\d+)?)$/;

/** Isolates `|` so `a|b` tokenizes the same as `a | b`. Pipes inside quotes stay literal. */
function spaceOutPipes(query: string): string {
	let out = '';
	let inQuotes = false;
	for (const ch of query) {
		if (ch === '"') inQuotes = !inQuotes;
		if (ch === '|' && !inQuotes) { out += ' | '; continue; }
		out += ch;
	}
	return out;
}

function parseCompare(raw: string): Comparison | null {
	const m = COMPARE_RE.exec(raw.trim());
	if (!m) return null;
	return { op: (m[1] as Comparator) ?? '=', value: Number(m[2]) };
}

/**
 * Splits a raw query into tokens. Unknown `field:` prefixes are NOT treated as fields — "Re:Zero"
 * must stay a plain search, so the prefix only counts when it names a real field.
 */
function parseQuery<T>(query: string, fields: SearchFieldSpec<T>[]): Token[] {
	const canonical = new Map<string, string>();
	for (const f of fields) {
		canonical.set(f.name.toLowerCase(), f.name);
		for (const a of f.aliases ?? []) canonical.set(a.toLowerCase(), f.name);
	}

	const tokens: Token[] = [];
	TOKEN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	// a bare `|` does not become a token — it flags the next one as an alternative
	let pendingOr = false;
	while ((m = TOKEN_RE.exec(spaceOutPipes(query))) !== null) {
		const prefix = m[2];
		const quoted = m[3];
		const bare = m[4];
		const field = prefix ? canonical.get(prefix.toLowerCase()) ?? null : null;
		// unknown prefix — fold it back into the text so "Re:Zero" still searches
		let text = quoted !== undefined ? quoted : bare ?? '';
		if (prefix && !field) text = `${prefix}:${text}`;
		if (!text) continue;
		if (quoted === undefined && text === '|') {
			// dangling leading `|` has nothing to join
			pendingOr = tokens.length > 0;
			continue;
		}
		tokens.push({
			negated: m[1] === '-',
			field,
			text,
			exact: quoted !== undefined,
			compare: quoted !== undefined ? null : parseCompare(text),
			alternate: pendingOr,
		});
		pendingOr = false;
	}
	return tokens;
}

/** One record of the fuzzy index: the item's id and the text of each text field under its name. */
type SearchRecord = { __id: string } & Record<string, unknown>;

/** What one search runs against: the items by id and one fuzzy index over their text, reused by every token. */
interface SearchIndex<T> {
	fields: SearchFieldSpec<T>[];
	byId: Map<string, T>;
	fuse: Fuse<SearchRecord>;
}

function buildIndex<T>(items: T[], config: SearchConfig<T>): SearchIndex<T> {
	const textFields = config.fields.filter(hasText);
	const records = items.map((item): SearchRecord => ({
		...Object.fromEntries(textFields.map((f) => [f.name, f.text(item)])),
		__id: config.id(item),
	}));
	return {
		fields: config.fields,
		byId: new Map(items.map((item) => [config.id(item), item])),
		fuse: new Fuse(records, {
			keys: textFields.map((f) => ({ name: f.name, weight: f.weight ?? 0.1 })),
			threshold: FUZZ_THRESHOLD,
			ignoreLocation: true,
			includeMatches: true,
		}),
	};
}

function idsWhere<T>(index: SearchIndex<T>, test: (item: T) => boolean): Set<string> {
	return new Set([...index.byId].filter(([, item]) => test(item)).map(([id]) => id));
}

/** `field:>n`: items whose number on one of the fields satisfies the comparison. No fuzz; a missing number never matches. */
function numericMatches<T>(index: SearchIndex<T>, { op, value }: Comparison, fields: NumberField<T>[]): Set<string> {
	const holds = COMPARE[op];
	return idsWhere(index, (item) => fields.some((f) => {
		const n = f.number(item);
		return n !== null && holds(n, value);
	}));
}

/** `"phrase"`: items with the phrase as a substring of one of the fields, ignoring case. */
function exactMatches<T>(index: SearchIndex<T>, phrase: string, fields: TextField<T>[]): Set<string> {
	const needle = phrase.toLowerCase();
	return idsWhere(index, (item) => fields.some((f) => f.text(item).some((v) => v.toLowerCase().includes(needle))));
}

/** A bare word: fuzzy over the index. With `fields`, only a hit inside one of them counts. */
function fuzzyMatches<T>(index: SearchIndex<T>, word: string, fields: SearchFieldSpec<T>[] | null): Set<string> {
	const results = index.fuse.search(word);
	const allowed = fields && new Set(fields.map((f) => f.name));
	const kept = allowed
		? results.filter((r) => (r.matches ?? []).some((m) => m.key && allowed.has(m.key)))
		: results;
	return new Set(kept.map((r) => r.item.__id));
}

/**
 * Ids matching one token, ignoring its negation. The kind of token picks the matcher: a comparison
 * on a named field that has numbers, else a quoted phrase, else a fuzzy word.
 */
function matches<T>(index: SearchIndex<T>, token: Token): Set<string> {
	const scope = token.field ? index.fields.filter((f) => f.name === token.field) : index.fields;
	const numeric = scope.filter(hasNumber);
	if (token.compare && token.field && numeric.length > 0) return numericMatches(index, token.compare, numeric);
	if (token.exact) return exactMatches(index, token.text, scope.filter(hasText));
	return fuzzyMatches(index, token.text, token.field ? scope : null);
}

/** `|` chains folded into groups: the tokens of a group are alternatives. */
function alternatives(tokens: Token[]): Token[][] {
	const groups: Token[][] = [];
	for (const token of tokens) {
		const last = groups[groups.length - 1];
		if (token.alternate && last) last.push(token);
		else groups.push([token]);
	}
	return groups;
}

/** Ids every group matches, a group matching what any of its tokens matches. No group at all means everything. */
function matchingEvery<T>(index: SearchIndex<T>, groups: Token[][]): Set<string> {
	let found: Set<string> | null = null;
	for (const group of groups) {
		const any = new Set(group.flatMap((token) => [...matches(index, token)]));
		found = found === null ? any : new Set([...found].filter((id) => any.has(id)));
		if (found.size === 0) break;
	}
	return found ?? new Set(index.byId.keys());
}

/**
 * Runs one query over `items`, returning matching ids — or null for an empty query, the shared
 * "no search active" signal the tabs already use.
 *
 * Semantics: bare tokens fuzzy-match and are ANDed **across** fields (so a cast word plus a studio
 * word can match one item between them), quoted tokens are exact substrings, `field:value` scopes to
 * one field, `field:>n` compares numerically, `a | b` matches either, and `-token` excludes.
 *
 * The cross-field AND is deliberate and has a known cost: unquoted "christopher nolan" also matches
 * an item with Christopher Plummer in the cast and Jane Nolan elsewhere. Quotes and `field:` are the
 * escape hatch. The previous same-field rule avoided that but made cross-field queries impossible.
 */
export function searchItems<T>(items: T[], config: SearchConfig<T>, query: string): Set<string> | null {
	const trimmed = query.trim();
	if (!trimmed) return null;

	const tokens = parseQuery(trimmed, config.fields);
	if (tokens.length === 0) return null;

	const index = buildIndex(items, config);
	// a query of only exclusions starts from everything
	const found = matchingEvery(index, alternatives(tokens.filter((t) => !t.negated)));
	for (const token of tokens.filter((t) => t.negated)) {
		for (const id of matches(index, token)) found.delete(id);
	}
	return found;
}

/** Year from an ISO-ish date string, or null. */
export function yearOf(date: string | null | undefined): number | null {
	if (!date) return null;
	const y = Number(String(date).slice(0, 4));
	return Number.isFinite(y) && y > 0 ? y : null;
}
