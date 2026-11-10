import { describe, it, expect } from 'vitest';
import data from './fixtures/data-v1.json';
import { setupBackup } from './helpers/setupBackup';
import { inferHistoryAction } from '../src/HistoryManager';
import { buildBackup, parseBackup, restoreBackup, withoutSecrets } from '../src/backup';

const BASE = 'hoard:\n  version: 1\n  statuses:\n    - name: Rewatch\n      color: "#123456"\n';

describe('backup/restore', () => {
	it('rejects a WatchLog v1 export', () => {
		const r = parseBackup(JSON.stringify(data));
		expect('error' in r).toBe(true);
	});

	it('round-trips through an empty vault', async () => {
		const a = await setupBackup({
			'W/Hoard.base': BASE,
			'W/TV Show/Dark.md': '---\nName: Dark\nType: TV Show\nWatched Episodes: S01E01-E03\nGroups: [X]\nSeasons: ["Season 1: 10"]\n---\n',
		});
		a.local.data.settings = { tmdbApiKey: 'SECRET' };
		const json = JSON.stringify(buildBackup(a));
		expect((JSON.parse(json) as { local: { tmdbApiKey?: string } }).local.tmdbApiKey).toBe('SECRET');

		const parsed = parseBackup(json);
		if ('error' in parsed) throw new Error(parsed.error);
		if (!('backup' in parsed)) throw new Error('expected a v2 backup');
		const b = await setupBackup({});
		await restoreBackup(b, parsed.backup);

		const t = b.dataManager.getTitle('TV Show/Dark');
		expect(t?.watchedEpisodes).toEqual([1, 2, 3]);
		expect(b.dataManager.getGroups().map((g) => g.name)).toEqual(['X']);
		expect(b.shared.get().settings.statuses).toEqual(a.shared.get().settings.statuses);
		// the key lands in data.json only, never in the vault
		expect(b.local.data.settings.tmdbApiKey).toBe('SECRET');
		for (const [path, content] of b.f.files) expect(content, path).not.toContain('SECRET');
	});

	it('rejects foreign formats', () => {
		expect('error' in parseBackup('{"version":3,"watch":{}}')).toBe(true);
		expect('error' in parseBackup('{"version":9}')).toBe(true);
		expect('error' in parseBackup('nope')).toBe(true);
	});
});

describe('history actions', () => {
	it('shows group creation as its own action', () => {
		const e = { id: '1', timestamp: '2026-01-01T00:00:00Z', message: 'Group "X" was created' };
		expect(inferHistoryAction(e)).toBe('group');
	});

	it('drops secrets for a copy written into the vault and ignores prototype keys on restore', async () => {
		const a = await setupBackup({});
		a.local.data.settings = { tmdbApiKey: 'SECRET', igdbClientSecret: 'S2', steamId: '42', jikanBaseUrl: 'https://u:PW@nas.example.org/v4', dateFormat: 'dmy' };
		const copy = withoutSecrets(buildBackup(a));
		expect(copy.local).toEqual({ jikanBaseUrl: 'https://nas.example.org/v4', dateFormat: 'dmy' });
		expect(JSON.stringify(copy)).not.toContain('SECRET');
		expect(JSON.stringify(copy)).not.toContain('PW');
		a.local.data.settings = { jikanBaseUrl: 'https://u:HALF@', dateFormat: 'dmy' };
		expect(withoutSecrets(buildBackup(a)).local).toEqual({ dateFormat: 'dmy' });

		const b = await setupBackup({});
		const parsed = parseBackup(JSON.stringify(buildBackup(a)).replace('"dateFormat"', '"__proto__":{"polluted":1},"dateFormat"'));
		if ('error' in parsed) throw new Error(parsed.error);
		if (!('backup' in parsed)) throw new Error('expected a v2 backup');
		await restoreBackup(b, parsed.backup);
		expect(Object.getPrototypeOf(b.local.data.settings)).toBe(Object.prototype);
		expect((b.local.data.settings as { polluted?: unknown }).polluted).toBeUndefined();
	});
});
