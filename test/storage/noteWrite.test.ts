import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApp } from '../fakes/fakeApp';
import { ensureFolder, freeNotePath, noteFile, parentOf, trashNote } from '../../src/storage/noteWrite';

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
