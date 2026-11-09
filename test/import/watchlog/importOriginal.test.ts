import { describe, it, expect } from 'vitest';
import watchLogData from '../../fixtures/data-v1.json';
import { WATCHLOG_NOTES, setupOriginal } from './setupSchema1';
import { snapshot } from './helpers';
import { importOriginal } from '../../../src/import/watchlog/importOriginal';
import type { ImportPhase } from '../../../src/import/watchlog/report';

const data = watchLogData;

describe('importOriginal', () => {
	it('creates notes below Hoard/, copies old bodies and lists, leaves sources untouched', async () => {
		const { f, ctx, src } = await setupOriginal(data, WATCHLOG_NOTES);
		const before = snapshot(f);
		const r = await importOriginal(src, ctx, () => {});
		expect(r.errors).toEqual([]);
		expect(f.files.get('Hoard/TV Show/Dark.md')).toContain('Great show');
		expect(f.files.get('Hoard/Books/Dune.md')).toContain('## Quotes');
		expect(f.files.get('Hoard/CustomLists/Shopping.md')).toBe(WATCHLOG_NOTES['Lists/Shopping.md']);
		for (const [p, c] of before.files) expect(f.files.get(p)).toBe(c);
		for (const [p, c] of before.adapterFiles) expect(f.adapterFiles.get(p)).toBe(c);
	});

	it('takes the old body instead of the one built from entry.notes', async () => {
		const notes = { ...WATCHLOG_NOTES, 'WatchLog/TV Show/Dark.md': '---\ntitle: Dark\n---\n\n## Notes\n\nOld body only\n' };
		const { f, ctx, src } = await setupOriginal(data, notes);
		await importOriginal(src, ctx, () => {});
		const dark = f.files.get('Hoard/TV Show/Dark.md');
		expect(dark).toContain('Old body only');
		expect(dark).not.toContain('Great show');
	});

	it('rerun changes nothing', async () => {
		const { f, ctx, src } = await setupOriginal(data, WATCHLOG_NOTES);
		await importOriginal(src, ctx, () => {});
		const after = snapshot(f);
		const r = await importOriginal(src, ctx, () => {});
		expect(snapshot(f)).toEqual(after);
		expect(r.created).toBe(0);
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'Hoard/CustomLists/Shopping.md', reason: 'exists' }));
	});

	it('reports differing existing values as kept-value and keeps the body', async () => {
		const existing = '---\nstatus: Completed\n---\n\nMine\n';
		const { f, ctx, src } = await setupOriginal(data, { ...WATCHLOG_NOTES, 'Hoard/TV Show/Dark.md': existing });
		const r = await importOriginal(src, ctx, () => {});
		expect(r.review).toContainEqual({
			path: 'Hoard/TV Show/Dark.md', reason: 'kept-value', code: 'keptValue', params: { key: 'status', hoard: 'Completed', watchlog: 'Watching' },
		});
		expect(f.files.get('Hoard/TV Show/Dark.md')).toContain('Mine');
	});

	it('reports invalid YAML of an existing note as error', async () => {
		const { ctx, src } = await setupOriginal(data, { ...WATCHLOG_NOTES, 'Hoard/TV Show/Dark.md': '---\na: [\n---\n' });
		const r = await importOriginal(src, ctx, () => {});
		expect(r.review).toContainEqual(expect.objectContaining({ path: 'Hoard/TV Show/Dark.md', reason: 'error' }));
		expect(r.errors.some((e) => e.startsWith('Hoard/TV Show/Dark.md'))).toBe(true);
	});

	it('reports progress per entry and once per later phase', async () => {
		const { ctx, src } = await setupOriginal(data, WATCHLOG_NOTES);
		const calls: [ImportPhase, number, number][] = [];
		await importOriginal(src, ctx, (phase, done, total) => calls.push([phase, done, total]));
		const notes = calls.filter((c) => c[0] === 'notes');
		expect(notes.length).toBeGreaterThan(0);
		expect(notes.at(-1)![1]).toBe(notes[0]![2]);
		for (const phase of ['history', 'base', 'settings'] as const) expect(calls.filter((c) => c[0] === phase)).toHaveLength(1);
	});
});
