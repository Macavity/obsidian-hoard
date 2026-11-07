import { describe, it, expect, vi } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { migrateWidgetFences, rewriteWidgetFences } from '../../../src/migration/watchlog/widgets';

describe('rewriteWidgetFences', () => {
	it('renames every WatchLog widget language', () => {
		const pairs: [string, string][] = [
			['watchlog', 'hoard'], ['wl-todo', 'hoard-todo'], ['wl-stat', 'hoard-stat'], ['wl-upcoming', 'hoard-upcoming'],
			['wl-nowwatching', 'hoard-nowwatching'], ['wl-now-next', 'hoard-now-next'],
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

describe('migrateWidgetFences', () => {
	it('changes only notes with a WatchLog fence and is idempotent', async () => {
		const f = createFakeApp({
			'A.md': '# A\n\n```wl-upcoming\n```\n',
			'B.md': '# B\n\n```hoard\nid\n```\n',
			'C.base': '```watchlog\n```\n',
		});
		const process = vi.spyOn(f.app.vault, 'process');
		expect(await migrateWidgetFences(f.app)).toBe(1);
		expect(f.files.get('A.md')).toBe('# A\n\n```hoard-upcoming\n```\n');
		expect(f.files.get('B.md')).toBe('# B\n\n```hoard\nid\n```\n');
		expect(f.files.get('C.base')).toBe('```watchlog\n```\n');
		expect(process).toHaveBeenCalledTimes(1);
		expect(await migrateWidgetFences(f.app)).toBe(0);
	});
});
