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

/** One piece of the query as written, before it means anything. */
interface Lexeme {
	negated: boolean;
	/** The word before a `:`, whether or not it names a field. */
	prefix: string | undefined;
	text: string;
	quoted: boolean;
}

function lex(query: string): Lexeme[] {
	return [...spaceOutPipes(query).matchAll(TOKEN_RE)].map((m) => ({
		negated: m[1] === '-',
		prefix: m[2],
		text: m[3] ?? m[4] ?? '',
		quoted: m[3] !== undefined,
	}));
}

const isPipe = (l: Lexeme): boolean => !l.quoted && l.prefix === undefined && l.text === '|';

/** Lower-cased name or alias of each field, mapped to the field's canonical name. */
function fieldNames<T>(fields: SearchFieldSpec<T>[]): Map<string, string> {
	return new Map(fields.flatMap((f) => [f.name, ...(f.aliases ?? [])].map((n): [string, string] => [n.toLowerCase(), f.name])));
}

/**
 * The token a lexeme stands for, or null when it leaves nothing to search for. A prefix counts as a
 * field only when it names one: "Re:Zero" must stay a plain search, so an unknown prefix is text.
 */
function toToken(lexeme: Lexeme, names: Map<string, string>, alternate: boolean): Token | null {
	const field = lexeme.prefix ? names.get(lexeme.prefix.toLowerCase()) ?? null : null;
	const text = lexeme.prefix && !field ? `${lexeme.prefix}:${lexeme.text}` : lexeme.text;
	if (!text) return null;
	return {
		negated: lexeme.negated,
		field,
		text,
		exact: lexeme.quoted,
		compare: lexeme.quoted ? null : parseCompare(text),
		alternate,
	};
}

/** Splits a raw query into tokens. A bare `|` is no token: it marks the next one as an alternative. */
function parseQuery<T>(query: string, fields: SearchFieldSpec<T>[]): Token[] {
	const names = fieldNames(fields);
	const tokens: Token[] = [];
	let alternate = false;
	for (const lexeme of lex(query)) {
		if (isPipe(lexeme)) {
			// a leading `|` has nothing to join
			alternate = tokens.length > 0;
			continue;
		}
		const token = toToken(lexeme, names, alternate);
		if (!token) continue;
		tokens.push(token);
		alternate = false;
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
