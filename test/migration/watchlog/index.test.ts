import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Notice } from 'obsidian';
import { parse, stringify } from 'yaml';
import watchLogData from '../../fixtures/data-v1.json';
import { createFakeApp } from '../../fakes/fakeApp';
import { LocalStore } from '../../../src/storage/LocalStore';
import { migrateFromWatchLog, type WatchLogSource } from '../../../src/migration/watchlog';
import { WATCHLOG_NOTES } from './setupSchema1';

const yaml = { parse, stringify };
const notices = Notice as unknown as { shown: string[] };
const SYNC: WatchLogSource = { id: 'watchlog-sync', dir: '.obsidian/plugins/watchlog-sync' };
const SYNC_BASE = 'filters:\n  and:\n    - file.inFolder("Media")\nviews: []\nwatchlog:\n  version: 1\n  halfStarRatings: true\n';
const FENCE_NOTE = '# Home\n\n```wl-todo\n```\n';

/** Loads data.json like main.ts and runs the migration with what it found. */
async function migrate(f: ReturnType<typeof createFakeApp>, adopted: WatchLogSource | null) {
	const local = new LocalStore(f.plugin);
	const loaded = await local.load();
	const report = await migrateFromWatchLog({
		app: f.app, local, yaml, pluginDir: f.plugin.manifest.dir, adopted,
		schema1: loaded.schema === 1 ? loaded.data : null,
		typeNames: () => ['Movie', 'TV Show'],
	});
	await local.flush();
	return report;
}

describe('migrateFromWatchLog', () => {
	beforeEach(() => { notices.shown = []; });

	it('returns null and touches nothing in a vault without WatchLog traces', async () => {
		const f = createFakeApp({ 'H/Hoard.base': 'hoard:\n  version: 1\n', 'Note.md': '```hoard-todo\n```\n' });
		const snapshot = new Map(f.files);
		const cachedRead = vi.spyOn(f.app.vault, 'cachedRead');
		const process = vi.spyOn(f.app.vault, 'process');
		expect(await migrate(f, null)).toBeNull();
		expect(f.files).toEqual(snapshot);
		expect(cachedRead.mock.calls.map(([file]) => file.path)).toEqual(['H/Hoard.base']);
		expect(process).not.toHaveBeenCalled();
		expect(notices.shown).toEqual([]);
	});

	it('migrates a WatchLog Sync vault: base, plugin data, widget fences; a second run finds nothing', async () => {
		const f = createFakeApp({ 'Media/WatchLog.base': SYNC_BASE, 'Home.md': FENCE_NOTE });
		f.plugin.data = { schemaVersion: 2, settings: { draftsTag: '#x' }, cache: {}, ui: {} };
		const r = await migrate(f, SYNC);
		expect(r).toMatchObject({
			base: { status: 'migrated', from: 'Media/WatchLog.base', to: 'Media/Hoard.base', rewritten: true },
			adoptedFrom: 'watchlog-sync',
			widgetNotes: 1,
		});
		expect(f.files.has('Media/WatchLog.base')).toBe(false);
		expect(f.files.get('Media/Hoard.base')).toBe(SYNC_BASE.replace('watchlog:', 'hoard:'));
		expect(f.files.get('Home.md')).toBe('# Home\n\n```hoard-todo\n```\n');
		expect(notices.shown).toHaveLength(1);
		expect(notices.shown[0]).toMatch(/Media\/WatchLog\.base → Media\/Hoard\.base.*watchlog-sync.*1 note/);

		notices.shown = [];
		expect(await migrate(f, null)).toBeNull();
		expect(notices.shown).toEqual([]);
	});

	it('converts WatchLog schema-1 data into notes and a base; a second run finds nothing', async () => {
		const f = createFakeApp({ ...WATCHLOG_NOTES, 'Home.md': FENCE_NOTE });
		f.plugin.data = structuredClone(watchLogData);
		const r = await migrate(f, null);
		expect(r?.schema1?.errors).toEqual([]);
		expect(r?.schema1?.notesCreated).toBeGreaterThan(0);
		expect(r?.widgetNotes).toBe(1);
		expect(f.files.get('WatchLog/Hoard.base')).toMatch(/^hoard:/m);
		expect(f.files.has('WatchLog/Movie/A.md')).toBe(true);
		expect(f.adapterFiles.has('.obsidian/plugins/hoard/data.v1-backup.json')).toBe(true);
		expect((f.plugin.data as { schemaVersion: number }).schemaVersion).toBe(2);
		expect(notices.shown[0]).toMatch(/data into notes/);

		const snapshot = new Map(f.files);
		expect(await migrate(f, null)).toBeNull();
		expect(f.files).toEqual(snapshot);
	});

	it('on a second device joins a migrated WatchLog.base instead of creating notes', async () => {
		const first = createFakeApp(WATCHLOG_NOTES);
		first.plugin.data = structuredClone(watchLogData);
		await migrate(first, null);
		const base = (first.files.get('WatchLog/Hoard.base') ?? '').replace(/^hoard:/m, 'watchlog:');
		const f = createFakeApp({ ...WATCHLOG_NOTES, 'WatchLog/WatchLog.base': base });
		f.plugin.data = structuredClone(watchLogData);
		const r = await migrate(f, null);
		expect(r?.schema1?.errors).toEqual([]);
		expect(f.files.has('WatchLog/WatchLog.base')).toBe(false);
		expect(f.files.get('WatchLog/Hoard.base')).toMatch(/^hoard:/m);
		expect(f.files.has('WatchLog/Movie/A.md')).toBe(false);
	});

	it('leaves WatchLog.base alone and warns when Hoard.base already exists', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const f = createFakeApp({ 'W/WatchLog.base': 'watchlog:\n  version: 1\n', 'W/Hoard.base': 'hoard:\n  version: 1\n' });
		const r = await migrate(f, null);
		expect(r?.base).toEqual({ status: 'blocked', path: 'W/WatchLog.base', existing: 'W/Hoard.base' });
		expect(f.files.get('W/WatchLog.base')).toBe('watchlog:\n  version: 1\n');
		expect(f.files.get('W/Hoard.base')).toBe('hoard:\n  version: 1\n');
		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[Hoard\] W\/WatchLog\.base left untouched/));
		expect(notices.shown).toEqual([]);
		warn.mockRestore();
	});
});
