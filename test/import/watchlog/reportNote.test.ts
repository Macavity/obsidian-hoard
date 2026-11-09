import { describe, it, expect } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { writeReportNote } from '../../../src/import/watchlog/reportNote';

describe('writeReportNote', () => {
	it('names the note by the local date and suffixes on collision', async () => {
		const f = createFakeApp({});
		const layout = new VaultLayout('Hoard', () => []);
		// 00:30 local time: UTC may still be the previous day
		const d = new Date(2026, 10, 8, 0, 30);
		const first = await writeReportNote(f.app, layout, '# a', d);
		expect(first.path).toBe('Hoard/WatchLog-Import 2026-11-08.md');
		expect(f.files.get(first.path)).toBe('# a');
		const second = await writeReportNote(f.app, layout, '# b', d);
		expect(second.path).toBe('Hoard/WatchLog-Import 2026-11-08 2.md');
	});
});
