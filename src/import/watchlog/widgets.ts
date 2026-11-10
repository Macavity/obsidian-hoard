/** WatchLog's code-block languages and their Hoard names. */
const LANGUAGES: Readonly<Record<string, string>> = {
	'watchlog': 'hoard',
	'wl-todo': 'hoard-todo',
	'wl-stat': 'hoard-stat',
	'wl-upcoming': 'hoard-upcoming',
	'wl-nowwatching': 'hoard-now',
	'wl-now-next': 'hoard-now-next',
};

const NAMES = Object.keys(LANGUAGES).join('|');
/** An opening fence (``` or ~~~, also indented or quoted) whose language is one of `LANGUAGES`. */
const FENCE = `^([ \\t]*(?:>[ \\t]*)*(?:\`{3,}|~{3,})[ \\t]*)(${NAMES})(?=[ \\t]|$)`;
const FENCE_TEST = new RegExp(FENCE, 'm');
const FENCE_ALL = new RegExp(FENCE, 'gm');

/** True when the note text has a WatchLog widget fence. */
export const hasWidgetFence = (src: string): boolean => FENCE_TEST.test(src);

/** The note text with every WatchLog widget fence renamed; attributes after the language stay. */
export function rewriteWidgetFences(src: string): string {
	return src.replace(FENCE_ALL, (_m, head: string, lang: string) => `${head}${LANGUAGES[lang] ?? lang}`);
}
