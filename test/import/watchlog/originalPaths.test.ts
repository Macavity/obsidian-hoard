import { describe, expect, it } from 'vitest';
import { originalFolders, originalNotePath } from '../../../src/import/watchlog/originalPaths';
import type { WatchLogData } from '../../../src/import/watchlog/schema1Types';

const data = (over: Record<string, unknown>): WatchLogData => ({ titles: [], groups: [], settings: {}, ...over });

describe('original WatchLog paths', () => {
	it('falls back to WatchLog defaults', () => {
		expect(originalFolders(data({}))).toEqual({
			root: 'WatchLog', book: 'WatchLog/Reading/Books', manga: 'WatchLog/Reading/Manga',
			game: 'WatchLog/Games', lists: 'WatchLog/CustomLists',
		});
	});

	it('follows its settings', () => {
		const f = originalFolders(data({
			settings: { rootFolder: 'Media', customListsFolder: 'Lists' },
			reading: { settings: { defaultFolder: 'Lesen' } },
			games: { settings: { defaultFolder: 'Gaming' } },
		}));
		expect(f).toEqual({ root: 'Media', book: 'Lesen/Books', manga: 'Lesen/Manga', game: 'Gaming', lists: 'Lists' });
	});

	it('builds note paths with WatchLog file names', () => {
		const f = originalFolders(data({}));
		expect(originalNotePath(f, 'title', 'Dark', 'TV Show')).toBe('WatchLog/TV Show/Dark.md');
		expect(originalNotePath(f, 'book', 'A/B: C?')).toBe('WatchLog/Reading/Books/A-B- C-.md');
		expect(originalNotePath(f, 'game', '  ')).toBe('WatchLog/Games/game.md');
	});
});
