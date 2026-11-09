import { describe, expect, it } from 'vitest';
import { createFakeApp } from '../../fakes/fakeApp';
import { VaultLayout } from '../../../src/storage/VaultLayout';
import { managedFiles, managedFolders } from '../../../src/import/watchlog/paths';

describe('managed paths', () => {
	it('lists type and fixed folders below the root', () => {
		const layout = new VaultLayout('WatchLog', () => ['Movie']);
		expect(managedFolders(layout, ['Movie'])).toEqual([
			'WatchLog/Movie', 'WatchLog/Books', 'WatchLog/Manga', 'WatchLog/Games', 'WatchLog/CustomLists',
		]);
	});

	it('at vault root: only managed files, never the excluded Hoard root or foreign notes', () => {
		const f = createFakeApp({
			'Movie/Heat.md': 'a', 'Books/Dune.md': 'b', 'History.md': 'h', 'Diary.md': 'x', 'Hoard/Movie/Old.md': 'o',
		});
		const layout = new VaultLayout('', () => ['Movie']);
		expect(managedFiles(f.app, layout, ['Movie'], 'Hoard').map((x) => x.path))
			.toEqual(['Books/Dune.md', 'History.md', 'Movie/Heat.md']);
	});
});
