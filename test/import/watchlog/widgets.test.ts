import { describe, it, expect } from 'vitest';
import { rewriteWidgetFences } from '../../../src/import/watchlog/widgets';

describe('rewriteWidgetFences', () => {
	it('renames every WatchLog widget language', () => {
		const pairs: [string, string][] = [
			['watchlog', 'hoard'], ['wl-todo', 'hoard-todo'], ['wl-stat', 'hoard-stat'], ['wl-upcoming', 'hoard-upcoming'],
			['wl-nowwatching', 'hoard-now'], ['wl-now-next', 'hoard-now-next'],
		];
		for (const [from, to] of pairs) {
			expect(rewriteWidgetFences(`\`\`\`${from}\nx\n\`\`\`\n`)).toBe(`\`\`\`${to}\nx\n\`\`\`\n`);
		}
	});

	it('keeps attributes, tilde fences, indentation and quotes', () => {
		expect(rewriteWidgetFences('~~~wl-stat type=Movie\n~~~')).toBe('~~~hoard-stat type=Movie\n~~~');
		expect(rewriteWidgetFences('  ```` watchlog {mini}\n````')).toBe('  ```` hoard {mini}\n````');
		expect(rewriteWidgetFences('> ```wl-todo\n> ```')).toBe('> ```hoard-todo\n> ```');
	});

	it('leaves other languages and plain text alone', () => {
		const src = '```watchlogger\n```\n```wl-todos\n```\nwatchlog in text\n`wl-todo` inline\n```js\n```\n';
		expect(rewriteWidgetFences(src)).toBe(src);
	});
});
