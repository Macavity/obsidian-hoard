import { describe, expect, it } from 'vitest';
import { importFork } from '../../../src/import/watchlog/importFork';
import { setupFork } from './setupFork';
import { snapshot } from './helpers';
import { decodeTitle } from '../../../src/storage/titleCodec';
import { parse } from 'yaml';

const fmOf = (content: string | undefined): Record<string, unknown> =>
	(parse(/^---\r?\n([\s\S]*?)\r?\n---/.exec(content ?? '')?.[1] ?? '') ?? {}) as Record<string, unknown>;

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
		expect(fmOf(f.files.get('Hoard/Movie/Heat.md'))).toEqual({ Name: 'Heat', Status: 'Completed' });
		expect(f.files.get('WatchLog/Movie/Heat.md')).toBe(FORK['WatchLog/Movie/Heat.md']);
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
		expect(fmOf(f.files.get('Movie/Heat.md'))).toMatchObject({ Name: 'Heat' });
		expect(r.created).toBeGreaterThan(0);
	});

	it('copies a fork nested inside Hoard\'s root', async () => {
		const { f, ctx, src } = await setupFork({
			'Media/Hoard.base': 'hoard:\n  types: []\n', 'Media/WatchLog/WatchLog.base': 'watchlog:\n  types:\n    - name: Movie\n',
			'Media/WatchLog/Movie/Heat.md': 'h',
		}, undefined, 'Media');
		await importFork(src, ctx, () => {});
		expect(f.files.get('Media/Movie/Heat.md')).toBe('h');
	});

	it('adds fork types an existing Hoard base lacks, keeps its own', async () => {
		const { ctx, src } = await setupFork({
			'WatchLog/WatchLog.base': 'watchlog:\n  types:\n    - name: Film\n      color: "#222"\n',
			'WatchLog/Film/Heat.md': 'h',
			'Hoard/Hoard.base': 'hoard:\n  types:\n    - name: Movie\n      color: "#000"\n',
		});
		await importFork(src, ctx, () => {});
		expect(ctx.shared.get().settings.types).toEqual([{ name: 'Movie', color: '#000' }, { name: 'Film', color: '#222' }]);
	});

	it('takes the fork\'s draft state when Hoard has none', async () => {
		const drafts = { dismissed: ['x'] };
		const { ctx, src } = await setupFork(FORK, { schemaVersion: 2, settings: {}, cache: {}, ui: {}, drafts });
		await importFork(src, ctx, () => {});
		expect(ctx.local.data.drafts).toEqual(drafts);
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

	describe('property names', () => {
		const base = 'WatchLog/WatchLog.base';
		const baseBody = 'watchlog:\n  settings: {}\nviews: []\n';

		it('translates the frontmatter of copied entry notes', async () => {
			const src0 = '---\ntitle: Heat\ndateAdded: 2024-01-01\nposter: https://p\nprogress: 100%\n---\nbody';
			const { f, ctx, src } = await setupFork({ [base]: baseBody, 'WatchLog/Movie/Heat.md': src0 });
			const report = await importFork(src, ctx, () => {});
			const content = f.files.get('Hoard/Movie/Heat.md');
			const fm = fmOf(content);
			expect(fm).toMatchObject({ Name: 'Heat', 'Date Added': '2024-01-01', Cover: 'https://p', Progress: 100 });
			expect(fm).not.toHaveProperty('title');
			expect(report.review).toEqual([]);
			expect(f.files.get('WatchLog/Movie/Heat.md')).toBe(src0);
			expect(content).toMatch(/---\nbody$/);
			expect(decodeTitle('x', fm, undefined).entry.title).toBe('Heat');
		});

		it('reports a key it could not rename', async () => {
			const { ctx, src } = await setupFork({ [base]: baseBody, 'WatchLog/Movie/Heat.md': '---\ntitle: Heat\nName: Other\n---\n' });
			const report = await importFork(src, ctx, () => {});
			expect(report.review).toContainEqual(expect.objectContaining({ path: 'Hoard/Movie/Heat.md', code: 'keptValue' }));
		});

		it('leaves custom lists and notes without frontmatter untouched', async () => {
			const { f, ctx, src } = await setupFork({
				[base]: baseBody, 'WatchLog/CustomLists/x.md': '---\ntitle: x\n---\n', 'WatchLog/Movie/Plain.md': 'just text',
			});
			await importFork(src, ctx, () => {});
			expect(fmOf(f.files.get('Hoard/CustomLists/x.md'))).toEqual({ title: 'x' });
			expect(f.files.get('Hoard/Movie/Plain.md')).toBe('just text');
		});

		it('copies notes that need no renaming byte for byte', async () => {
			const unknown = '---\n# my own comment\nmine: "quoted"\nother:   [1,   2]\n---\nbody\n';
			const current = '---\nName: "Heat"   # kept\nCover: \'https://p\'\n---\n';
			const { f, ctx, src } = await setupFork({
				[base]: baseBody, 'WatchLog/Movie/Unknown.md': unknown, 'WatchLog/Movie/Current.md': current,
			});
			const report = await importFork(src, ctx, () => {});
			expect(f.files.get('Hoard/Movie/Unknown.md')).toBe(unknown);
			expect(f.files.get('Hoard/Movie/Current.md')).toBe(current);
			expect(report.review).toEqual([]);
		});

		it('reports broken YAML and keeps the copy', async () => {
			const broken = '---\ntitle: [unclosed\n---\n';
			const { f, ctx, src } = await setupFork({ [base]: baseBody, 'WatchLog/Movie/Bad.md': broken });
			const report = await importFork(src, ctx, () => {});
			expect(f.files.get('Hoard/Movie/Bad.md')).toBe(broken);
			expect(report.review).toContainEqual({ path: 'Hoard/Movie/Bad.md', reason: 'error', code: 'invalidYaml' });
		});
	});
});
