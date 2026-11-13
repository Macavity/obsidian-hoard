import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApp } from '../fakes/fakeApp';
import { VaultLayout } from '../../src/storage/VaultLayout';
import { getBaseline } from '../../src/storage/baseline';
import type { ManagerNotice } from '../../src/storage/storageTypes';
import {
	ensureFolder, freeNotePath, noteFile, parentOf, setChangedKeys, trashNote, writeEntry,
	type EntryWriteHooks, type NoteIo,
} from '../../src/storage/noteWrite';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('noteFile', () => {
	it('finds a file, and neither a folder nor nothing', () => {
		const { app } = createFakeApp({ 'W/Movie/A.md': 'a' });
		expect(noteFile(app, 'W/Movie/A.md')?.path).toBe('W/Movie/A.md');
		expect(noteFile(app, 'W/Movie')).toBeNull();
		expect(noteFile(app, 'W/Movie/B.md')).toBeNull();
	});
});

describe('freeNotePath', () => {
	it('keeps a free path', () => {
		const { app } = createFakeApp({});
		expect(freeNotePath(app, 'W/Movie/A.md')).toBe('W/Movie/A.md');
	});

	it('counts up from 2 past the names that are taken', () => {
		const { app } = createFakeApp({ 'W/Movie/A.md': '', 'W/Movie/A 2.md': '', 'W/Movie/A 4.md': '' });
		expect(freeNotePath(app, 'W/Movie/A.md')).toBe('W/Movie/A 3.md');
	});
});

describe('parentOf', () => {
	it('is the folder part of a path, empty at the top level', () => {
		expect(parentOf('W/Movie/A.md')).toBe('W/Movie');
		expect(parentOf('A.md')).toBe('');
	});
});

describe('ensureFolder', () => {
	it('creates a missing folder with its parents', async () => {
		const { app } = createFakeApp({});
		await ensureFolder(app, 'W/Movie');
		expect(app.vault.getAbstractFileByPath('W/Movie')).not.toBeNull();
		expect(app.vault.getAbstractFileByPath('W')).not.toBeNull();
	});

	it('does not create a folder that exists, nor the vault root', async () => {
		const { app } = createFakeApp({ 'W/Movie/A.md': '' });
		const create = vi.spyOn(app.vault, 'createFolder');
		await ensureFolder(app, 'W/Movie');
		await ensureFolder(app, '');
		await ensureFolder(app, '/');
		expect(create).not.toHaveBeenCalled();
	});

	it('is fine with a folder that appeared in the meantime', async () => {
		const { app } = createFakeApp({});
		vi.spyOn(app.vault, 'createFolder').mockRejectedValueOnce(new Error('Folder already exists.'));
		await expect(ensureFolder(app, 'W/Movie')).resolves.toBeUndefined();
	});
});

describe('trashNote', () => {
	it('trashes the note at the path', async () => {
		const { app, files } = createFakeApp({ 'W/Movie/A.md': 'a', 'W/Movie/B.md': 'b' });
		await trashNote(app, 'W/Movie/A.md');
		expect([...files.keys()]).toEqual(['W/Movie/B.md']);
	});

	it('does nothing for a path without a note', async () => {
		const { app, files } = createFakeApp({ 'W/Movie/A.md': 'a' });
		await trashNote(app, 'W/Movie/B.md');
		await trashNote(app, 'W/Movie');
		expect([...files.keys()]).toEqual(['W/Movie/A.md']);
	});
});

interface Entry { id: string; title: string; rating: number }

const encodeEntry = (x: Entry): Record<string, unknown> => ({ Name: x.title, ...(x.rating ? { Rating: x.rating } : {}) });

/** A fake vault with one kind of entry under W/Books, and hooks that record what the pipeline asks of them. */
function harness(files: Record<string, string>, opts: { baseline?: Entry; live?: boolean; hooks?: Partial<EntryWriteHooks<Entry>> } = {}) {
	const f = createFakeApp(files);
	const layout = new VaultLayout('W', () => []);
	const notices: ManagerNotice[] = [];
	const calls: string[] = [];
	const written: { fm: Record<string, unknown>; noteAtThatMoment: string | undefined }[] = [];
	const hooks: EntryWriteHooks<Entry> = {
		baselineOf: () => { calls.push('baselineOf'); return opts.baseline; },
		movedPath: (src, entry) => { calls.push('movedPath'); return entry.title !== src.title ? `W/Books/${entry.title}.md` : null; },
		moveId: (from, to) => { calls.push(`moveId ${from} -> ${to}`); },
		prepare: () => { calls.push('prepare'); return encodeEntry; },
		afterWrite: (entry, fm) => {
			calls.push('afterWrite');
			written.push({ fm, noteAtThatMoment: f.files.get(layout.pathFromId(entry.id)) });
		},
		isLiveCopy: () => opts.live ?? false,
		unchanged: () => { calls.push('unchanged'); },
		create: () => { calls.push('create'); return Promise.resolve(); },
		...opts.hooks,
	};
	const io: NoteIo = { app: f.app, layout: () => layout, notify: (n) => { notices.push(n); } };
	return { f, io, hooks, calls, written, notices, write: (entry: Entry) => writeEntry(io, hooks, entry) };
}

const A = '---\nName: A\nRating: 1\nmyKey: 1\n---\nbody\n';
const stored = (): Entry => ({ id: 'Books/A', title: 'A', rating: 1 });

describe('setChangedKeys', () => {
	it('sets the changed keys the encoded entry has and deletes the ones it lacks', () => {
		const raw: Record<string, unknown> = { Name: 'A', Rating: 1, Review: 'old', myKey: 1 };
		setChangedKeys(raw, ['Rating', 'Review', 'Status'], { Name: 'other', Rating: 3, Status: 'x' });
		expect(raw).toEqual({ Name: 'A', Rating: 3, myKey: 1, Status: 'x' });
	});
});

describe('writeEntry', () => {
	it('lets the manager create the note of an entry that has none', async () => {
		const h = harness({});
		expect(await h.write({ id: 'Books/New', title: 'New', rating: 0 })).toBe('created');
		expect(h.calls).toEqual(['create']);
	});

	it('writes the keys that differ from the baseline and leaves the rest of the note alone', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored() });
		expect(await h.write({ id: 'Books/A', title: 'A', rating: 3 })).toBe('written');
		expect(h.f.files.get('W/Books/A.md')).toBe('---\nName: A\nRating: 3\nmyKey: 1\n---\nbody\n');
		expect(h.calls).toEqual(['baselineOf', 'movedPath', 'prepare', 'afterWrite']);
	});

	it('deletes a key the entry no longer encodes', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored() });
		await h.write({ id: 'Books/A', title: 'A', rating: 0 });
		expect(h.f.files.get('W/Books/A.md')).toBe('---\nName: A\nmyKey: 1\n---\nbody\n');
	});

	it('runs the bookkeeping before the note changes, with a copy of the new properties', async () => {
		const h = harness({ 'W/Books/A.md': A }, {
			baseline: stored(),
			hooks: {
				afterWrite: (entry, fm) => {
					h.written.push({ fm: { ...fm }, noteAtThatMoment: h.f.files.get('W/Books/A.md') });
					fm.Smuggled = true;
				},
			},
		});
		await h.write({ id: 'Books/A', title: 'A', rating: 3 });
		expect(h.written).toEqual([{ fm: { Name: 'A', Rating: 3, myKey: 1 }, noteAtThatMoment: A }]);
		expect(h.f.files.get('W/Books/A.md')).not.toContain('Smuggled');
	});

	it('writes every encoded key when no baseline is known, and asks for no move', async () => {
		const h = harness({ 'W/Books/A.md': '---\nmyKey: 1\n---\n' });
		expect(await h.write({ id: 'Books/A', title: 'A', rating: 2 })).toBe('written');
		expect(h.f.files.get('W/Books/A.md')).toBe('---\nmyKey: 1\nName: A\nRating: 2\n---\n');
		expect(h.calls).toEqual(['baselineOf', 'prepare', 'afterWrite']);
	});

	it('writes nothing when nothing differs and hands the copy to the manager', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored() });
		let modifies = 0;
		h.f.app.vault.on('modify', () => { modifies++; });
		const entry = stored();
		expect(await h.write(entry)).toBe('unchanged');
		await new Promise((r) => setTimeout(r, 20));
		expect(modifies).toBe(0);
		expect(h.f.files.get('W/Books/A.md')).toBe(A);
		expect(h.calls).toEqual(['baselineOf', 'movedPath', 'prepare', 'unchanged']);
		expect(getBaseline(entry)).toBeUndefined();
	});

	it('reports a note it cannot update and leaves the copy without a baseline', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored() });
		vi.spyOn(h.f.app.fileManager, 'processFrontMatter').mockRejectedValueOnce(new Error('bad yaml'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const entry = { id: 'Books/A', title: 'A', rating: 3 };
		expect(await h.write(entry)).toBe('unreadable');
		expect(h.f.files.get('W/Books/A.md')).toBe(A);
		expect(h.notices).toEqual([{ code: 'invalidYaml', file: 'A' }]);
		expect(h.calls).toEqual(['baselineOf', 'movedPath', 'prepare']);
		expect(getBaseline(entry)).toBeUndefined();
	});

	it('gives a copy that is not the live one a baseline of what it just wrote', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored(), live: false });
		const entry = { id: 'Books/A', title: 'A', rating: 3 };
		await h.write(entry);
		expect(getBaseline(entry)).toEqual({ id: 'Books/A', title: 'A', rating: 3 });
		expect(getBaseline(entry)).not.toBe(entry);
	});

	it('leaves the baseline of the live copy to the manager', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored(), live: true });
		const entry = { id: 'Books/A', title: 'A', rating: 3 };
		await h.write(entry);
		expect(getBaseline(entry)).toBeUndefined();
	});
});

describe('writeEntry: a move', () => {
	it('renames the note, re-keys, then gives the entry its new id and writes to the moved note', async () => {
		const idsAtMove: string[] = [];
		const entry = { id: 'Books/A', title: 'B', rating: 2 };
		const h = harness({ 'W/Books/A.md': A }, {
			baseline: stored(),
			hooks: { moveId: (from, to) => { idsAtMove.push(`${from} -> ${to} while the entry is ${entry.id}`); } },
		});
		expect(await h.write(entry)).toBe('written');
		expect(idsAtMove).toEqual(['Books/A -> Books/B while the entry is Books/A']);
		expect(entry.id).toBe('Books/B');
		expect(h.f.files.has('W/Books/A.md')).toBe(false);
		expect(h.f.files.get('W/Books/B.md')).toBe('---\nName: B\nRating: 2\nmyKey: 1\n---\nbody\n');
		expect(h.calls).toEqual(['baselineOf', 'movedPath', 'prepare', 'afterWrite']);
		expect(h.written[0]?.noteAtThatMoment).toBe(A);
	});

	it('creates the folder of the target first', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored(), hooks: { movedPath: () => 'W/Shelf/B.md' } });
		const createFolder = vi.spyOn(h.f.app.vault, 'createFolder');
		const entry = { id: 'Books/A', title: 'B', rating: 1 };
		await h.write(entry);
		expect(createFolder).toHaveBeenCalledWith('W/Shelf');
		expect(h.f.files.has('W/Shelf/B.md')).toBe(true);
		expect(entry.id).toBe('Shelf/B');
	});

	it('keeps the note where it is when the target is taken, reports it, and still writes', async () => {
		const h = harness({ 'W/Books/A.md': A, 'W/Books/B.md': 'other' }, { baseline: stored() });
		const entry = { id: 'Books/A', title: 'B', rating: 1 };
		expect(await h.write(entry)).toBe('written');
		expect(entry.id).toBe('Books/A');
		expect(h.f.files.get('W/Books/B.md')).toBe('other');
		expect(h.f.files.get('W/Books/A.md')).toContain('Name: B');
		expect(h.notices).toEqual([{ code: 'renameTargetExists', target: 'W/Books/B.md' }]);
		expect(h.calls).toEqual(['baselineOf', 'movedPath', 'prepare', 'afterWrite']);
	});

	it('does nothing for a target that is where the note already is', async () => {
		const h = harness({ 'W/Books/A.md': A }, { baseline: stored(), hooks: { movedPath: () => 'W/Books/A.md' } });
		const rename = vi.spyOn(h.f.app.fileManager, 'renameFile');
		await h.write({ id: 'Books/A', title: 'A', rating: 3 });
		expect(rename).not.toHaveBeenCalled();
		expect(h.notices).toEqual([]);
	});
});
