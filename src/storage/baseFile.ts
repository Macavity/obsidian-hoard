import type { YamlIO } from './storageTypes';

const KEY = 'hoard';
/** Top-level key written by WatchLog Sync; read as a fallback and replaced on the next write. */
const LEGACY_KEY = 'watchlog';
const INFOLDER_RE = /^(\s*-\s+file\.inFolder\(")((?:[^"\\]|\\.)*)("\)\s*)$/;

const indentOf = (line: string): number => line.length - line.trimStart().length;
const isBlank = (line: string): boolean => line.trim() === '';

function lines(src: string): string[] {
	return src.split('\n');
}

/** [start, end) of the top-level `<key>:` block; trailing blank lines excluded. */
function blockRange(ls: string[], key: string): [number, number] | null {
	const start = ls.findIndex((l) => l.startsWith(`${key}:`));
	if (start < 0) return null;
	let end = start + 1;
	while (end < ls.length && (isBlank(ls[end] ?? '') || /^\s/.test(ls[end] ?? ''))) end++;
	while (end > start + 1 && isBlank(ls[end - 1] ?? '')) end--;
	return [start, end];
}

/** The `hoard:` block, else the legacy `watchlog:` one, with the key it was found under. */
function findBlock(ls: string[]): { key: string; range: [number, number] } | null {
	for (const key of [KEY, LEGACY_KEY]) {
		const range = blockRange(ls, key);
		if (range) return { key, range };
	}
	return null;
}

/** True when the base holds a `hoard:` or a legacy `watchlog:` block. */
export function hasHoardKey(src: string): boolean {
	return findBlock(lines(src)) !== null;
}

export function readHoardBlock(src: string, yaml: YamlIO): Record<string, unknown> | null {
	const ls = lines(src);
	const found = findBlock(ls);
	if (!found) return null;
	const [start, end] = found.range;
	const parsed = yaml.parse(ls.slice(start, end).join('\n')) as Record<string, unknown> | null;
	const block = parsed?.[found.key];
	return block && typeof block === 'object' && !Array.isArray(block) ? (block as Record<string, unknown>) : null;
}

/** Replaces or appends only the `hoard:` block (a legacy `watchlog:` one is replaced by it); the rest stays byte-identical. */
export function writeHoardBlock(src: string, block: Record<string, unknown>, yaml: YamlIO): string {
	const text = yaml.stringify({ [KEY]: block }).replace(/\n+$/, '');
	const ls = lines(src);
	const found = findBlock(ls);
	if (!found) {
		const sep = src === '' || src.endsWith('\n') ? '' : '\n';
		return `${src}${sep}${text}\n`;
	}
	const [start, end] = found.range;
	return [...ls.slice(0, start), ...text.split('\n'), ...ls.slice(end)].join('\n');
}

/** Index of the top-level `filters.and` item line holding `file.inFolder("…")`. */
function findInFolderLine(ls: string[]): number {
	const filters = ls.findIndex((l) => /^filters:\s*$/.test(l));
	if (filters < 0) return -1;
	let i = filters + 1;
	let andIndent = -1;
	for (; i < ls.length; i++) {
		const l = ls[i] ?? '';
		if (isBlank(l)) continue;
		if (indentOf(l) === 0) return -1;
		if (/^\s+and:\s*$/.test(l)) {
			andIndent = indentOf(l);
			i++;
			break;
		}
	}
	if (andIndent < 0) return -1;
	let itemIndent = -1;
	for (; i < ls.length; i++) {
		const l = ls[i] ?? '';
		if (isBlank(l)) continue;
		const ind = indentOf(l);
		if (ind <= andIndent) return -1;
		if (itemIndent < 0) itemIndent = ind;
		if (ind === itemIndent && INFOLDER_RE.test(l)) return i;
	}
	return -1;
}

const unescape = (s: string): string => s.replace(/\\(.)/g, '$1');
const escape = (s: string): string => s.replace(/[\\"]/g, '\\$&');

export function findInFolderPath(src: string): string | null {
	const ls = lines(src);
	const i = findInFolderLine(ls);
	if (i < 0) return null;
	const m = INFOLDER_RE.exec(ls[i] ?? '');
	return m ? unescape(m[2] ?? '') : null;
}

export function replaceInFolderPath(src: string, folder: string): string | null {
	const ls = lines(src);
	const i = findInFolderLine(ls);
	if (i < 0) return null;
	ls[i] = (ls[i] ?? '').replace(INFOLDER_RE, (_m, a: string, _p: string, c: string) => `${a}${escape(folder)}${c}`);
	return ls.join('\n');
}

export function createBaseFile(root: string, block: Record<string, unknown>, yaml: YamlIO): string {
	const head = `filters:\n  and:\n    - file.inFolder("${escape(root)}")\nviews:\n  - type: table\n    name: All\n`;
	return writeHoardBlock(head, block, yaml);
}
