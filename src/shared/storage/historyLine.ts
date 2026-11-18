import type { HistoryAction, HistorySource } from '../HistoryManager';
import { defined } from './sharedHelpers';

export type HistoryLineAction = HistoryAction | 'group-created';

export interface HistoryLine {
	timestamp: string;
	action: HistoryLineAction;
	target: string;
	isLink: boolean;
	message?: string;
	source?: HistorySource;
}

const SEP = ' · ';
const ACTIONS: readonly HistoryLineAction[] = ['added', 'completed', 'deleted', 'status', 'rating', 'watched', 'group-created'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SOURCES: Record<string, HistorySource> = { watchlist: 'Watchlist', reading: 'Reading', games: 'Games' };

const isTimestamp = (v: string): boolean => ISO.test(v) && !Number.isNaN(Date.parse(v));
const isAction = (v: string): v is HistoryLineAction => (ACTIONS as readonly string[]).includes(v);

/** The text up to the next separator and what follows it; null when there is no separator. */
function takeField(text: string): [field: string, rest: string] | null {
	const end = text.indexOf(SEP);
	return end < 0 ? null : [text.slice(0, end), text.slice(end + SEP.length)];
}

/** The first two fields and what follows them; null when the text has fewer than three fields. */
function takeHead(text: string): [timestamp: string, action: string, rest: string] | null {
	const first = takeField(text);
	const second = first && takeField(first[1]);
	return first && second ? [first[0], second[0], second[1]] : null;
}

/** The target at the start of `text`: a `[[link]]`, or plain text up to the next separator. null when there is none. */
function takeTarget(text: string): { target: string; isLink: boolean; rest: string } | null {
	const link = /^\[\[(.+?)\]\]/.exec(text);
	if (!link) {
		const [target, rest] = takeField(text) ?? [text, ''];
		return target ? { target, isLink: false, rest } : null;
	}
	const after = text.slice(link[0].length);
	// a link is followed by a separator or by nothing
	if (after !== '' && !after.startsWith(SEP)) return null;
	return { target: link[1] ?? '', isLink: true, rest: after.slice(SEP.length) };
}

/** A trailing `#watchlist`, `#reading` or `#games` is the source; what stands before it is the message. */
function takeSource(text: string): { message: string; source: HistorySource | undefined } {
	const tag = /(?:^|\s)#(watchlist|reading|games)$/.exec(text);
	if (!tag) return { message: text.trim(), source: undefined };
	return { message: text.slice(0, tag.index).trim(), source: SOURCES[tag[1] ?? ''] };
}

/** Parses "- <ISO> · <action> · <target> · <message> #source". Returns null for non-matching lines. */
export function parseHistoryLine(line: string): HistoryLine | null {
	const head = line.startsWith('- ') ? takeHead(line.slice(2)) : null;
	if (!head) return null;
	const [timestamp, action, afterAction] = head;
	if (!isTimestamp(timestamp) || !isAction(action)) return null;
	const target = takeTarget(afterAction);
	if (!target) return null;

	const { message, source } = takeSource(target.rest);
	return {
		timestamp,
		action,
		target: target.target,
		isLink: target.isLink,
		...defined({ source, message: message || undefined }),
	};
}

/** Inverse of parseHistoryLine. */
export function formatHistoryLine(l: HistoryLine): string {
	const parts = [`- ${l.timestamp}`, l.action, l.isLink ? `[[${l.target}]]` : l.target];
	const msg = [l.message ?? '', l.source ? `#${l.source.toLowerCase()}` : ''].filter(Boolean).join(' ');
	if (msg) parts.push(msg);
	return parts.join(SEP);
}
