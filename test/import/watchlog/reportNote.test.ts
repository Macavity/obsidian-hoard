import { describe, it, expect } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { writeReportNote } from '../../../src/import/watchlog/reportNote';

const report = { created: 1, filled: 0, errors: ['boom'], review: [{ path: 'Hoard/Movie/Heat.md', reason: 'exists' as const, detail: 'already there' }] };

describe('writeReportNote', () => {
	it('writes every review item as wikilink', async () => {
		const f = createFakeApp({});
		const layout = new VaultLayout('Hoard', () => []);
		const file = await writeReportNote(f.app, layout, { fork: report }, new Date('2026-11-08'));
		expect(file.path).toBe('Hoard/WatchLog-Import 2026-11-08.md');
		const text = f.files.get(file.path)!;
		expect(text).toContain('## WatchLog Sync');
		expect(text).toContain('### Already existed');
		expect(text).toContain('- [[Hoard/Movie/Heat.md]] – already there');
		expect(text).toContain('### Errors\n\n- boom');
	});

	it('suffixes on collision and labels the original', async () => {
		const f = createFakeApp({});
		const layout = new VaultLayout('Hoard', () => []);
		const d = new Date('2026-11-08');
		await writeReportNote(f.app, layout, { original: report }, d);
		const second = await writeReportNote(f.app, layout, { original: report }, d);
		expect(second.path).toBe('Hoard/WatchLog-Import 2026-11-08 2.md');
		expect(f.files.get(second.path)).toContain('## WatchLog\n');
	});
});
