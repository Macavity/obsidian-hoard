import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planCleanup, runCleanup } from '../../../src/import/watchlog/cleanup';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { detectWatchLogSources } from '../../../src/import/watchlog/detect';
import { snapshot } from './helpers';
import { setupCleanup } from './setupCleanup';
import { WATCHLOG_NOTES } from './setupSchema1';

const FORK = {
	'WatchLog/WatchLog.base': 'watchlog:\n  settings:\n    types:\n      - name: Movie\n',
	'WatchLog/Movie/Heat.md': 'a', 'WatchLog/Movie/Ronin.md': 'b',
	'Hoard/Hoard.base': 'hoard:\n  settings: {}\n', 'Hoard/Movie/Heat.md': 'a',
};

describe('planCleanup', () => {
	it('plans only files with a Hoard counterpart', async () => {
		const { f, sources, layout } = await setupCleanup(FORK);
		const items = await planCleanup(f.app, sources, layout, ['fork']);
		expect(items.find((i) => i.id === 'fork-notes')?.paths).toEqual(['WatchLog/Movie/Heat.md']);
		expect(items.find((i) => i.id === 'fork-base')?.paths).toEqual(['WatchLog/WatchLog.base']);
	});

	it('plans nothing for sources that were not imported', async () => {
		const { f, sources, layout } = await setupCleanup(FORK);
		expect(await planCleanup(f.app, sources, layout, [])).toEqual([]);
	});

	it('plans original notes via WatchLog paths only with counterpart', async () => {
		const data = readFileSync('test/fixtures/data-v1.json', 'utf8');
		const { f, layout } = await setupCleanup({ ...WATCHLOG_NOTES, '.obsidian/plugins/watchlog/data.json': data });
		f.adapterFiles.set('.obsidian/plugins/watchlog/data.json', data);
		const src = await detectWatchLogSources(f.app);
		expect(src.original).not.toBeNull();
		const before = await planCleanup(f.app, src, layout, ['original']);
		expect(before.find((i) => i.id === 'original-notes')).toBeUndefined();
		// counterparts carry the WatchLog body (as the import writes it); Shopping differs
		f.externalWrite('Hoard/TV Show/Dark.md', '---\nstatus: Watching\n---\n\n## Notes\n\nGreat show\n');
		f.externalWrite('Hoard/Books/Dune.md', WATCHLOG_NOTES['WatchLog/Reading/Books/Dune.md']!);
		f.externalWrite('Hoard/CustomLists/Shopping.md', 'x');
		const items = await planCleanup(f.app, src, layout, ['original']);
		const paths = items.find((i) => i.id === 'original-notes')?.paths ?? [];
		expect(paths).toContain('WatchLog/TV Show/Dark.md');
		expect(paths).toContain('WatchLog/Reading/Books/Dune.md');
		expect(paths).not.toContain('WatchLog/Reading/Manga/Berserk.md');
		expect(paths).not.toContain('Lists/Shopping.md');
	});

	it('never offers a Hoard note that is its own counterpart (same root)', async () => {
		const data = readFileSync('test/fixtures/data-v1.json', 'utf8');
		const { f } = await setupCleanup(WATCHLOG_NOTES);
		f.adapterFiles.set('.obsidian/plugins/watchlog/data.json', data);
		const src = await detectWatchLogSources(f.app);
		const same = new VaultLayout('WatchLog', () => ['TV Show']);
		expect(await planCleanup(f.app, src, same, ['original'])).toEqual([]);
	});

	it('never offers fork files that are Hoard\'s own (both at the vault root)', async () => {
		const { f, sources } = await setupCleanup({
			'WL.base': 'watchlog:\n  settings: {}\n', 'Hoard.base': 'hoard:\n  settings: {}\n', 'Movie/Heat.md': 'a',
		});
		const root = new VaultLayout('', () => ['Movie']);
		expect((await planCleanup(f.app, sources, root, ['fork'])).find((i) => i.id === 'fork-notes')).toBeUndefined();
	});

	it('keeps fork files whose Hoard copy differs (kept on import)', async () => {
		const { f, sources, layout } = await setupCleanup({
			...FORK, 'WatchLog/History.md': 'fork log', 'Hoard/History.md': 'hoard log', 'Hoard/Movie/Ronin.md': 'changed',
		});
		const paths = (await planCleanup(f.app, sources, layout, ['fork'])).find((i) => i.id === 'fork-notes')?.paths;
		expect(paths).toEqual(['WatchLog/Movie/Heat.md']);
	});
});

describe('runCleanup', () => {
	it('nothing selected changes nothing', async () => {
		const { f, layout } = await setupCleanup({ 'n.md': '```watchlog\n```\n' });
		const before = snapshot(f);
		expect(await runCleanup(f.app, [], layout)).toEqual({ done: 0, errors: [] });
		expect(snapshot(f)).toEqual(before);
	});

	it('widgets item rewrites fences', async () => {
		const { f, layout } = await setupCleanup({ 'n.md': '```wl-todo\n```\n' });
		await runCleanup(f.app, [{ id: 'widgets', paths: ['n.md'] }], layout);
		expect(f.files.get('n.md')).toBe('```hoard-todo\n```\n');
	});

	it('trashes planned notes and empty folders, never the Hoard root', async () => {
		const { f, layout } = await setupCleanup(FORK);
		const res = await runCleanup(f.app, [{ id: 'fork-notes', paths: ['WatchLog/Movie/Heat.md'] }], layout);
		expect(res).toEqual({ done: 1, errors: [] });
		expect(f.files.has('WatchLog/Movie/Heat.md')).toBe(false);
		expect(f.app.vault.getAbstractFileByPath('WatchLog/Movie')).not.toBeNull();
		await runCleanup(f.app, [{ id: 'fork-notes', paths: ['WatchLog/Movie/Ronin.md'] }], layout);
		expect(f.app.vault.getAbstractFileByPath('WatchLog/Movie')).toBeNull();
		expect(f.app.vault.getAbstractFileByPath('WatchLog')).not.toBeNull(); // still holds the base
		const hoard = new VaultLayout('Hoard', () => []);
		await runCleanup(f.app, [{ id: 'fork-notes', paths: ['Hoard/Movie/Heat.md'] }], hoard);
		expect(f.app.vault.getAbstractFileByPath('Hoard')).not.toBeNull();
	});

	it('collects per-file errors and continues', async () => {
		const { f, layout } = await setupCleanup({ 'a.md': 'x', 'b.md': 'y' });
		const real = f.app.fileManager.trashFile;
		f.app.fileManager.trashFile = (file) => (file.path === 'a.md' ? Promise.reject(new Error('nope')) : real(file));
		const res = await runCleanup(f.app, [{ id: 'fork-notes', paths: ['a.md', 'b.md'] }], layout);
		expect(res.done).toBe(1);
		expect(res.errors).toEqual(['a.md: nope']);
		expect(f.files.has('b.md')).toBe(false);
	});
});
