import { describe, expect, it, vi } from 'vitest';
import { createImporter } from '../../../src/import/watchlog/importer';
import { getDecision } from '../../../src/import/watchlog/onboardingState';
import { detectWatchLogSources } from '../../../src/import/watchlog/detect';
import { setupFork } from './setupFork';

const FORK = {
	'WatchLog/WatchLog.base': 'watchlog:\n  settings: {}\nviews: []\n',
	'WatchLog/Movie/Heat.md': '---\ntitle: Heat\nstatus: Completed\n---\n',
};

async function make() {
	const s = await setupFork(FORK);
	const openFile = vi.fn();
	const sources = await detectWatchLogSources(s.f.app);
	const importer = createImporter({ app: s.f.app, local: s.local, ctx: () => s.ctx, layout: () => s.ctx.layout, openFile }, sources);
	return { s, importer, openFile };
}

describe('createImporter', () => {
	it('exposes the sources and delegates decide and openFile', async () => {
		const { s, importer, openFile } = await make();
		expect(importer.sources.fork).not.toBeNull();
		importer.decide('fork', 'imported');
		expect(getDecision(s.local, 'fork')).toBe('imported');
		importer.openFile('a.md');
		expect(openFile).toHaveBeenCalledWith('a.md');
	});

	it('runs the fork import and writes the report note', async () => {
		const { s, importer } = await make();
		const report = await importer.run('fork', () => {});
		expect(s.f.app.vault.getAbstractFileByPath('Hoard/Movie/Heat.md')).not.toBeNull();
		const file = await importer.writeReport({ fork: report });
		expect(file.path).toMatch(/^Hoard\/WatchLog-Import /);
	});

	it('plans and runs a cleanup without items', async () => {
		const { importer } = await make();
		const items = await importer.plan([]);
		expect(items).toEqual([]);
		expect(await importer.cleanup(items)).toEqual({ done: 0, errors: [] });
	});
});
