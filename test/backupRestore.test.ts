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
			'W/TV Show/Dark.md': '---\ntitle: Dark\ntype: TV Show\nwatched: S01E01-E03\ngroups: [X]\nseasons: ["Season 1: 10"]\n---\n',
		});
		// a backup from an older version still carries the key in its local section
		const json = JSON.stringify({ ...buildBackup(a), local: { tmdbApiKey: 'SECRET' } });

		const parsed = parseBackup(json);
		if ('error' in parsed) throw new Error(parsed.error);
		if (!('backup' in parsed)) throw new Error('expected a v2 backup');
		const b = await setupBackup({});
		await restoreBackup(b, parsed.backup);

		const t = b.dataManager.getTitle('TV Show/Dark');
		expect(t?.watchedEpisodes).toEqual([1, 2, 3]);
		expect(b.dataManager.getGroups().map((g) => g.name)).toEqual(['X']);
		expect(b.shared.get().settings.statuses).toEqual(a.shared.get().settings.statuses);
		// the key lands in secret storage only, never in the vault or data.json
		await b.local.flush();
		expect(b.secrets.get('hoard-tmdb-api-key')).toBe('SECRET');
		expect(JSON.stringify(b.savedData())).not.toContain('SECRET');
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

	it('keeps secrets out of a backup built from stored data', async () => {
		const a = await setupBackup({}, { 'hoard-tmdb-api-key': 'SECRET' });
		a.local.data.settings = { dateFormat: 'dmy' };
		a.local.queueSave();
		await a.local.flush();
		const json = JSON.stringify(buildBackup(a));
		expect(json).not.toContain('SECRET');
		expect(json).not.toContain('tmdbApiKey');
	});

	it('restores old backup keys into empty secret storage only, never into data.json', async () => {
		const src = await setupBackup({});
		const parsed = parseBackup(JSON.stringify({ ...buildBackup(src), local: { tmdbApiKey: 'OLD', dateFormat: 'dmy' } }));
		if (!('backup' in parsed)) throw new Error('expected backup');

		const kept = await setupBackup({}, { 'hoard-tmdb-api-key': 'NEW' });
		await restoreBackup(kept, parsed.backup);
		await kept.local.flush();
		expect(JSON.stringify(kept.savedData())).not.toContain('tmdbApiKey');
		expect(kept.secrets.get('hoard-tmdb-api-key')).toBe('NEW');

		const fresh = await setupBackup({});
		await restoreBackup(fresh, parsed.backup);
		await fresh.local.flush();
		expect(JSON.stringify(fresh.savedData())).not.toContain('tmdbApiKey');
		expect(fresh.secrets.get('hoard-tmdb-api-key')).toBe('OLD');
	});

	it('leaves out secret keys that are still in memory before a save', async () => {
		const a = await setupBackup({});
		a.local.data.settings = { tmdbApiKey: 'SECRET', jikanBaseUrl: 'https://u:PW@nas.example.org/v4', dateFormat: 'dmy' };
		expect(buildBackup(a).local).toEqual({ dateFormat: 'dmy' });
	});

	it('drops secrets for a copy written into the vault and ignores prototype keys on restore', async () => {
		const a = await setupBackup({});
		// an old backup file can still carry keys; the vault copy must drop them
		const local = { tmdbApiKey: 'SECRET', igdbClientSecret: 'S2', steamId: '42', jikanBaseUrl: 'https://u:PW@nas.example.org/v4', dateFormat: 'dmy' };
		const copy = withoutSecrets({ ...buildBackup(a), local });
		expect(copy.local).toEqual({ jikanBaseUrl: 'https://nas.example.org/v4', dateFormat: 'dmy' });
		expect(JSON.stringify(copy)).not.toContain('SECRET');
		expect(JSON.stringify(copy)).not.toContain('PW');
		expect(withoutSecrets({ ...buildBackup(a), local: { jikanBaseUrl: 'https://u:HALF@', dateFormat: 'dmy' } }).local).toEqual({ dateFormat: 'dmy' });

		const b = await setupBackup({});
		const parsed = parseBackup(JSON.stringify(buildBackup(a)).replace('"dateFormat"', '"__proto__":{"polluted":1},"dateFormat"'));
		if ('error' in parsed) throw new Error(parsed.error);
		if (!('backup' in parsed)) throw new Error('expected a v2 backup');
		await restoreBackup(b, parsed.backup);
		expect(Object.getPrototypeOf(b.local.data.settings)).toBe(Object.prototype);
		expect((b.local.data.settings as { polluted?: unknown }).polluted).toBeUndefined();
	});
});
