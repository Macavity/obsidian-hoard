import { describe, it, expect } from 'vitest';
import { setupBackup } from '../../helpers/setupBackup';
import { parseBackup } from '../../../src/backup';
import { restoreWatchLogBackup } from '../../../src/migration/watchlog/backupImport';
import watchLogData from '../../fixtures/data-v1.json';

describe('WatchLog backup import (v1-v3)', () => {
	it('imports a v3 backup without touching existing values or schemaVersion', async () => {
		const { reading, games, history, ...watch } = watchLogData as Record<string, unknown>;
		const parsed = parseBackup(JSON.stringify({ version: 3, exportedAt: 'x', watch, reading, games, history }));
		if (!('watchLog' in parsed)) throw new Error('expected a WatchLog backup');
		const b = await setupBackup({ 'W/Movie/A.md': '---\ntitle: A\ntype: Movie\nrating: 5\n---\n' });
		const schema = b.local.data.schemaVersion;
		const errors = await restoreWatchLogBackup(b, parsed.watchLog);
		expect(errors).toEqual([]);
		expect(b.f.files.get('W/Movie/A.md')).toMatch(/rating: 5/);
		expect(b.f.files.has('W/TV Show/Dark.md')).toBe(true);
		expect(b.f.files.has('W/Books/Dune.md')).toBe(true);
		expect(b.dataManager.getTitle('TV Show/Dark')).toBeDefined();
		expect(b.f.adapterFiles.has('.obsidian/plugins/hoard/data.v1-backup.json')).toBe(false);
		expect(b.local.data.schemaVersion).toBe(schema);
		expect(b.local.data.settings.tmdbApiKey).toBe('tmdb-SecretValue');
		for (const [path, content] of b.f.files) expect(content, path).not.toMatch(/SecretValue/);
	});

	it('restores WatchLog API keys only where the local value is missing', async () => {
		const { reading, games, history, ...watch } = watchLogData as Record<string, unknown>;
		const settings = { ...(watch.settings as Record<string, unknown>), tmdbApiKey: 'K1', omdbApiKey: 'K2' };
		const parsed = parseBackup(JSON.stringify({ version: 3, exportedAt: 'x', watch: { ...watch, settings }, reading, games, history }));
		if (!('watchLog' in parsed)) throw new Error('expected a WatchLog backup');
		const b = await setupBackup({});
		b.local.data.settings = { omdbApiKey: 'LOCAL', tmdbApiKey: '' };
		await restoreWatchLogBackup(b, parsed.watchLog);
		expect(b.local.data.settings.tmdbApiKey).toBe('K1');
		expect(b.local.data.settings.omdbApiKey).toBe('LOCAL');
		for (const [path, content] of b.f.files) expect(content, path).not.toContain('K1');
	});

	it('maps v1 and v2 files and validates them', () => {
		const v1 = parseBackup(JSON.stringify(watchLogData));
		expect('watchLog' in v1).toBe(true);
		const { reading, ...watch } = watchLogData as Record<string, unknown>;
		expect('watchLog' in parseBackup(JSON.stringify({ version: 2, watch, reading, history: [] }))).toBe(true);
		expect('error' in parseBackup(JSON.stringify({ version: 3, watch, reading, history: [] }))).toBe(true);
		expect('error' in parseBackup(JSON.stringify({ version: 2, watch: {}, reading, history: [] }))).toBe(true);
	});
});
