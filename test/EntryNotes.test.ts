import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { createStores } from './helpers/common';
import type { HeldEntries } from '../src/shared/storage/noteWrite';

const NOTE = '---\ntitle: A\n---\n\n## Notes\n\nbody\n';

async function setup(files: Record<string, string> = {}) {
	const s = await createStores(files);
	return { ...s, notes: s.base.notes };
}

describe('EntryNotes', () => {
	it('maps ids, paths and kinds through the layout', async () => {
		const { notes } = await setup();
		const path = notes.pathFor('title', 'Dune', 'Movie');
		expect(notes.pathOf(notes.idOf(path))).toBe(path);
		expect(notes.classify(path)).toMatchObject({ kind: 'title', type: 'Movie' });
		expect(notes.root).toBe('W');
		expect(notes.folderFor('game')).toBe('W/Games');
	});

	it('finds the file of an id, and null for a missing one', async () => {
		const { notes } = await setup({ 'W/Games/A.md': NOTE });
		expect(notes.fileOf('Games/A')).toBeInstanceOf(TFile);
		expect(notes.fileOf('Games/B')).toBeNull();
		expect(notes.exists('W/Games/A.md')).toBe(true);
		expect(notes.exists('W/Games/B.md')).toBe(false);
	});

	it('reserves the first free path, creates the folder and reports the id', async () => {
		const { notes, f } = await setup({ 'W/Games/A.md': NOTE });
		const slot = await notes.reserve('game', 'A');
		expect(slot.path).toBe('W/Games/A 2.md');
		expect(slot.id).toBe(notes.idOf(slot.path));
		expect(notes.nextId('game', 'A')).toBe(slot.id);
		const fresh = await notes.reserve('book', 'X');
		expect(f.app.vault.getAbstractFileByPath(notes.folderFor('book'))).not.toBeNull();
		await notes.create(fresh.path, NOTE);
		expect(f.files.get(fresh.path)).toBe(NOTE);
	});

	it('reads, rewrites and updates the properties of a note', async () => {
		const { notes, f } = await setup({ 'W/Games/A.md': NOTE });
		const file = notes.fileOf('Games/A')!;
		expect(await notes.read(file)).toBe(NOTE);
		expect(await notes.cachedRead(file)).toBe(NOTE);
		await notes.process(file, (c) => c.replace('body', 'changed'));
		expect(f.files.get('W/Games/A.md')).toContain('changed');
		expect(await notes.updateProperties(file, (fm) => { fm.title = 'B'; })).toBe(true);
		expect(f.files.get('W/Games/A.md')).toContain('title: B');
	});

	it('reports unreadable YAML as a notice and returns false', async () => {
		const { notes, notices } = await setup({ 'W/Games/A.md': NOTE });
		const file = notes.fileOf('Games/A')!;
		const ok = await notes.updateProperties(file, () => { throw new Error('bad yaml'); });
		expect(ok).toBe(false);
		expect(notices).toEqual([{ code: 'invalidYaml', file: 'A' }]);
	});

	it('trashes a note, and ignores a missing one', async () => {
		const { notes, f } = await setup({ 'W/Games/A.md': NOTE });
		await notes.trash('Games/B');
		expect(f.files.has('W/Games/A.md')).toBe(true);
		await notes.trash('Games/A');
		expect(f.files.has('W/Games/A.md')).toBe(false);
	});

	it('removes a note and forgets what the manager holds for it', async () => {
		const { notes, f, index } = await setup({ 'W/Games/A.md': NOTE });
		const slot = { src: { id: 'Games/A' }, view: { id: 'Games/A' } };
		const held: HeldEntries<typeof slot> = { index, views: new Map([['Games/A', slot]]), dirty: new Set(['Games/A']) };
		await notes.remove(held, 'Games/A');
		expect(f.files.has('W/Games/A.md')).toBe(false);
		expect(held.views.size).toBe(0);
		expect(held.dirty.size).toBe(0);
	});

	it('follows a rename of a note with a pending edit', async () => {
		const { notes, f, index } = await setup({ 'W/Games/A.md': NOTE });
		const slot = { src: { id: 'Games/A' }, view: { id: 'Games/A' } };
		const held: HeldEntries<typeof slot> = { index, views: new Map([['Games/A', slot]]), dirty: new Set(['Games/A']) };
		notes.followRenames(held);
		await f.app.vault.rename(notes.fileOf('Games/A')!, 'W/Games/B.md');
		await Promise.resolve();
		expect([...held.dirty]).toEqual(['Games/B']);
		expect(held.views.get('Games/B')?.view.id).toBe('Games/B');
	});

	it('watches modified, created and renamed files', async () => {
		const { notes, f } = await setup({ 'W/Games/A.md': NOTE });
		const seen: string[] = [];
		notes.watch((file) => seen.push(`change:${file.path}`), (file, old) => seen.push(`rename:${old}>${file.path}`));
		await f.app.vault.create('W/Games/C.md', NOTE);
		await f.app.vault.modify(notes.fileOf('Games/A')!, NOTE + 'x');
		await f.app.vault.rename(notes.fileOf('Games/A')!, 'W/Games/D.md');
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual(expect.arrayContaining(['change:W/Games/C.md', 'change:W/Games/A.md', 'rename:W/Games/A.md>W/Games/D.md']));
	});
});
