import type { YamlIO } from './storageTypes';

const KEY = 'hoard';
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

/** True when the YAML text holds a top-level `<key>:` block. */
export function hasTopLevelKey(src: string, key: string): boolean {
	return blockRange(lines(src), key) !== null;
}

/** True when the base holds a `hoard:` block. */
export function hasHoardKey(src: string): boolean {
	return hasTopLevelKey(src, KEY);
}

/**
 * Removes every top-level `<from>:` block. Without a `<to>:` block the first one becomes it (key
 * renamed, content kept); the rest stays byte-identical. Returns `src` when there is none.
 */
export function renameTopLevelBlock(src: string, from: string, to: string): string {
	let ls = lines(src);
	let hasTarget = blockRange(ls, to) !== null;
	for (let r = blockRange(ls, from); r; r = blockRange(ls, from)) {
		const [start, end] = r;
		if (hasTarget) {
			ls = [...ls.slice(0, start), ...ls.slice(end)];
		} else {
			ls[start] = to + (ls[start] ?? '').slice(from.length);
			hasTarget = true;
		}
	}
	return ls.join('\n');
}

export function readHoardBlock(src: string, yaml: YamlIO): Record<string, unknown> | null {
	const ls = lines(src);
	const range = blockRange(ls, KEY);
	if (!range) return null;
	const [start, end] = range;
	const parsed = yaml.parse(ls.slice(start, end).join('\n')) as Record<string, unknown> | null;
	const block = parsed?.[KEY];
	return block && typeof block === 'object' && !Array.isArray(block) ? (block as Record<string, unknown>) : null;
}

/** Replaces or appends only the `hoard:` block; the rest stays byte-identical. */
export function writeHoardBlock(src: string, block: Record<string, unknown>, yaml: YamlIO): string {
	const text = yaml.stringify({ [KEY]: block }).replace(/\n+$/, '');
	const ls = lines(src);
	const range = blockRange(ls, KEY);
	if (!range) {
		const sep = src === '' || src.endsWith('\n') ? '' : '\n';
		return `${src}${sep}${text}\n`;
	}
	const [start, end] = range;
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
