import { describe, it, expect, vi } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { migrateWatchLogBase } from '../../../src/migration/watchlog/base';
import { renameTopLevelBlock } from '../../../src/storage/baseFile';
import { TFile } from 'obsidian';

const fileAt = (f: ReturnType<typeof createFakeApp>, path: string): TFile => {
	const file = f.app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error(`no file at ${path}`);
	return file;
};

describe('renameTopLevelBlock', () => {
	it('renames the only block, content and rest byte-identical', () => {
		const src = 'a: 1\nwatchlog:\n  version: 1   # kept\n  halfStarRatings: true\n\nviews: []\n';
		expect(renameTopLevelBlock(src, 'watchlog', 'hoard')).toBe('a: 1\nhoard:\n  version: 1   # kept\n  halfStarRatings: true\n\nviews: []\n');
	});
	it('drops every block when the target exists', () => {
		const both = 'watchlog:\n  version: 1\nhoard:\n  version: 2\nwatchlog:\n  x: 1\nviews: []\n';
		expect(renameTopLevelBlock(both, 'watchlog', 'hoard')).toBe('hoard:\n  version: 2\nviews: []\n');
	});
	it('keeps the first and drops the others without a target', () => {
		const two = 'watchlog:\n  a: 1\nwatchlog:\n  b: 2\n';
		expect(renameTopLevelBlock(two, 'watchlog', 'hoard')).toBe('hoard:\n  a: 1\n');
	});
	it('leaves text without the block unchanged', () => {
		expect(renameTopLevelBlock('views: []\n', 'watchlog', 'hoard')).toBe('views: []\n');
	});
});

describe('migrateWatchLogBase', () => {
	it('renames WatchLog.base to Hoard.base and rewrites the key', async () => {
		const src = 'filters:\n  and:\n    - file.inFolder("W")\nwatchlog:\n  version: 1\nviews: []\n';
		const f = createFakeApp({ 'W/WatchLog.base': src });
		const renameFile = vi.spyOn(f.app.fileManager, 'renameFile');
		const r = await migrateWatchLogBase(f.app, fileAt(f, 'W/WatchLog.base'));
		expect(r).toEqual({ status: 'migrated', from: 'W/WatchLog.base', to: 'W/Hoard.base', rewritten: true });
		expect(renameFile).toHaveBeenCalledTimes(1);
		expect(f.files.has('W/WatchLog.base')).toBe(false);
		expect(f.files.get('W/Hoard.base')).toBe(src.replace('watchlog:', 'hoard:'));
	});

	it('rewrites only the key when the base is already named Hoard.base', async () => {
		const f = createFakeApp({ 'Hoard.base': 'watchlog:\n  version: 1\nhoard:\n  version: 1\n' });
		const r = await migrateWatchLogBase(f.app, fileAt(f, 'Hoard.base'));
		expect(r).toEqual({ status: 'migrated', from: 'Hoard.base', to: 'Hoard.base', rewritten: true });
		expect(f.files.get('Hoard.base')).toBe('hoard:\n  version: 1\n');
	});

	it('leaves the WatchLog base untouched when Hoard.base exists beside it', async () => {
		const f = createFakeApp({ 'W/WatchLog.base': 'watchlog:\n  version: 1\n', 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const r = await migrateWatchLogBase(f.app, fileAt(f, 'W/WatchLog.base'));
		expect(r).toEqual({ status: 'blocked', path: 'W/WatchLog.base', existing: 'W/Hoard.base' });
		expect(f.files.get('W/WatchLog.base')).toBe('watchlog:\n  version: 1\n');
		expect(f.files.get('W/Hoard.base')).toBe('hoard:\n  version: 1\n');
	});
});
