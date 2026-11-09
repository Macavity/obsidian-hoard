import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n';
import { reportMarkdown, reviewDetail } from '../src/WatchLogReport';
import type { ImportReport } from '../src/import/watchlog/report';

const report: ImportReport = {
	created: 1, filled: 0,
	errors: ['Hoard/Movie/A.md: disk full', 'boom'],
	review: [
		{ path: 'Hoard/Movie/[Oshi no Ko] #1.md', reason: 'exists' },
		{ path: 'Hoard/Movie/Heat.md', reason: 'kept-value', code: 'keptValue', params: { key: 'rating', hoard: '5', watchlog: '2' } },
		{ path: 'Hoard/Movie/A.md', reason: 'error', code: 'failed', params: { message: 'disk full' } },
	],
};

afterEach(() => setLocale('en'));

describe('reportMarkdown', () => {
	it('links every path safely and lists general errors once', () => {
		setLocale('en');
		const md = reportMarkdown({ fork: report });
		expect(md).toContain('## WatchLog Sync');
		expect(md).toContain('### Already existed\n\n- [\\[Oshi no Ko\\] #1.md]'.replace('[\\[', '[Hoard/Movie/\\['));
		expect(md).toContain('(Hoard/Movie/%5BOshi%20no%20Ko%5D%20%231.md)');
		expect(md).toContain('rating: Hoard "5", WatchLog "2"');
		expect(md).toContain('- boom');
		expect(md).not.toContain('- Hoard/Movie/A.md: disk full');
		expect(md).toContain('[Hoard/Movie/A.md](Hoard/Movie/A.md) – disk full');
	});

	it('follows the UI language', () => {
		setLocale('de');
		expect(reportMarkdown({ original: report })).toContain('### Existierte bereits');
		expect(reviewDetail(report.review[1]!)).toBe('rating: Hoard „5“, WatchLog „2“');
	});
});
