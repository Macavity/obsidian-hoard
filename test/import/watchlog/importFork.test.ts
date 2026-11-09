import { describe, expect, it } from 'vitest';
import { importFork } from '../../../src/import/watchlog/importFork';
import { setupFork } from './setupFork';
import { snapshot } from './helpers';

const FORK = {
	'WatchLog/WatchLog.base': 'watchlog:\n  settings: {}\nviews: []\n',
	'WatchLog/Movie/Heat.md': '---\ntitle: Heat\nstatus: Completed\n---\n',
	'WatchLog/History.md': '- 2025-01-01 added Heat\n',
	'WatchLog/Private.md': 'not ours',
};

describe('importFork', () => {
	it('copies managed files with same relative paths and creates Hoard.base', async () => {
		const { f, ctx, src } = await setupFork(FORK);
		const before = snapshot(f);
		const r = await importFork(src, ctx, () => {});
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/Movie/Heat.md')).toBe(FORK['WatchLog/Movie/Heat.md']);
		expect(f.files.get('Hoard/History.md')).toBe(FORK['WatchLog/History.md']);
		expect(f.files.get('Hoard/Hoard.base')).toMatch(/^hoard:/);
		expect(f.files.has('Hoard/Private.md')).toBe(false);
		for (const [p, c] of before.files) expect(f.files.get(p)).toBe(c);
	});

	it('root "" never copies Hoard/ or foreign notes', async () => {
		const { f, ctx, src } = await setupFork({ 'WatchLog.base': 'watchlog:\n  settings: {}\n', 'Movie/Heat.md': '---\ntitle: Heat\n---\n', 'Diary.md': 'x', 'Hoard/Movie/Old.md': 'o' });
		await importFork(src, ctx, () => {});
		expect(f.files.has('Hoard/Diary.md')).toBe(false);
		expect(f.files.has('Hoard/Hoard/Movie/Old.md')).toBe(false);
		expect(f.files.get('Hoard/Movie/Heat.md')).toBeDefined();
	});

	it('Hoard at the vault root still copies a nested fork', async () => {
		const { f, ctx, src } = await setupFork({ ...FORK, 'Hoard.base': 'hoard:\n  settings: {}\n' }, undefined, '');
		const r = await importFork(src, ctx, () => {});
		expect(f.files.get('Movie/Heat.md')).toBe(FORK['WatchLog/Movie/Heat.md']);
		expect(r.created).toBeGreaterThan(0);
	});

	it('existing target is reported, not overwritten', async () => {
		const { f, ctx, src } = await setupFork({ ...FORK, 'Hoard/Movie/Heat.md': 'mine' });
		const r = await importFork(src, ctx, () => {});
		expect(f.files.get('Hoard/Movie/Heat.md')).toBe('mine');
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'Hoard/Movie/Heat.md', reason: 'exists' }));
	});

	it('fills settings, Hoard cache wins', async () => {
		const { ctx, src } = await setupFork(FORK, { schemaVersion: 2, settings: { tmdbApiKey: 'k', omdbApiKey: 'o' }, cache: { 'Movie/Heat': { year: 1 } }, ui: {} });
		ctx.local.data.settings.omdbApiKey = 'mine';
		ctx.local.data.cache['Movie/Heat'] = { year: 2 } as never;
		await importFork(src, ctx, () => {});
		expect(ctx.local.data.settings).toMatchObject({ tmdbApiKey: 'k', omdbApiKey: 'mine' });
		expect(ctx.local.data.cache['Movie/Heat']).toEqual({ year: 2 });
	});

	it('takes no shared or removed settings into data.json', async () => {
		const { ctx, src } = await setupFork(FORK, { schemaVersion: 2, settings: { tmdbApiKey: 'k', types: [{ name: 'X' }], rootFolder: 'WatchLog' }, cache: {}, ui: {} });
		await importFork(src, ctx, () => {});
		expect(ctx.local.data.settings).toEqual({ tmdbApiKey: 'k' });
	});
});
